-- =============================================================================
-- FocusGate – 0004 focus session integrity, actual vs credited minutes
--
-- Fixes the P0 overtime invalidation gap:
--   1. Separates raw elapsed time (`actual_minutes`) from capped progress credit
--      (`credited_minutes = min(actual_minutes, planned_minutes * 2)` when valid).
--   2. A completed session that meets `min_valid_focus_minutes` is never marked
--      `is_valid = false` solely because the user worked past `planned_minutes * 2`.
--   3. Preserves historical session validity (`is_valid = false` historical rows
--      are NOT retroactively promoted to valid during backfill).
--   4. Updates `v_plan_progress`, `rpc_complete_focus_session`,
--      `rpc_complete_plan_task`, and `rpc_evaluate_unlock` so every module uses
--      `credited_minutes` as the single authoritative focus credit metric.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Add credited_minutes to focus_sessions & safely backfill existing rows
-- ---------------------------------------------------------------------------
alter table public.focus_sessions
    add column if not exists credited_minutes integer not null default 0
        check (credited_minutes between 0 and 1200);

-- Temporarily disable user triggers on focus_sessions during historical backfill
-- so immutable completed/cancelled sessions can have credited_minutes populated
-- without altering their historical `is_valid` or `actual_minutes` values.
alter table public.focus_sessions disable trigger user;

update public.focus_sessions
set credited_minutes = case
    when status = 'completed' and is_valid then
        least(greatest(actual_minutes, 0), planned_minutes * 2)
    else 0
end;

alter table public.focus_sessions enable trigger user;

-- ---------------------------------------------------------------------------
-- 2. Authoritative validation trigger: Actual vs. Valid vs. Credited
-- ---------------------------------------------------------------------------
create or replace function public.fn_validate_focus_session()
returns trigger
language plpgsql
as $$
declare
    v_min_valid integer := 1;
    v_elapsed_minutes integer;
begin
    select s.min_valid_focus_minutes into v_min_valid
    from public.user_settings s
    where s.user_id = new.user_id;

    v_min_valid := greatest(coalesce(v_min_valid, 1), 1);
    new.is_valid := false;
    new.credited_minutes := 0;

    if new.planned_minutes is null or new.planned_minutes not between 1 and 600 then
        raise exception 'invalid_input: planned minutes must be between 1 and 600'
            using errcode = '22023';
    end if;

    if new.ended_at is not null and new.ended_at < new.started_at then
        raise exception 'focus session ends before it starts' using errcode = '22007';
    end if;

    if new.status = 'completed' and new.ended_at is not null then
        v_elapsed_minutes := greatest(
            0,
            floor(extract(epoch from (new.ended_at - new.started_at)) / 60)::integer
        );

        -- Clamp claimed actual_minutes to wall-clock elapsed time (0..600).
        if new.actual_minutes is null or new.actual_minutes < 0 then
            new.actual_minutes := 0;
        end if;
        if new.actual_minutes > v_elapsed_minutes + 1 then
            new.actual_minutes := least(v_elapsed_minutes, 600);
        end if;
        new.actual_minutes := least(greatest(new.actual_minutes, 0), 600);

        -- A session is valid when it meets the minimum duration threshold.
        -- Overtime beyond 2x planned duration does NOT invalidate the session;
        -- instead, credited_minutes is deterministically capped at 2x planned.
        new.is_valid := new.actual_minutes >= v_min_valid
            and new.actual_minutes > 0;

        if new.is_valid then
            new.credited_minutes := least(new.actual_minutes, new.planned_minutes * 2);
        else
            new.credited_minutes := 0;
        end if;
    elsif new.status = 'cancelled' then
        new.actual_minutes := 0;
        new.is_valid := false;
        new.credited_minutes := 0;
    end if;

    return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Update v_plan_progress to sum credited_minutes
-- ---------------------------------------------------------------------------
create or replace view public.v_plan_progress
with (security_invoker = true) as
select
    dp.id                                          as plan_id,
    dp.user_id,
    dp.plan_date,
    dp.status,
    count(pt.id) filter (where pt.kind = 'must_do')                                   as must_do_total,
    count(pt.id) filter (where pt.kind = 'must_do' and pt.completed_at is not null)   as must_do_completed,
    coalesce(sum(pt.required_focus_minutes) filter (where pt.kind = 'must_do'), 0)::integer as must_do_focus_required,
    coalesce((
        select sum(fs.credited_minutes)
        from public.focus_sessions fs
        join public.daily_plan_tasks pt2 on pt2.task_id = fs.task_id and pt2.plan_id = dp.id
        where fs.daily_plan_id = dp.id and fs.is_valid and pt2.kind = 'must_do'
    ), 0)::integer                                                                    as must_do_focus_done,
    count(pt.id) filter (where pt.kind = 'bonus' and pt.completed_at is not null)     as bonus_completed
from public.daily_plans dp
left join public.daily_plan_tasks pt on pt.plan_id = dp.id
group by dp.id, dp.user_id, dp.plan_date, dp.status;

-- ---------------------------------------------------------------------------
-- 4. Update rpc_complete_focus_session to return creditedMinutes + actualMinutes
-- ---------------------------------------------------------------------------
create or replace function public.rpc_complete_focus_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_uid uuid := auth.uid();
    v_session public.focus_sessions%rowtype;
    v_elapsed integer;
begin
    if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;

    select * into v_session from public.focus_sessions
    where id = p_session_id and user_id = v_uid
    for update;
    if not found then raise exception 'forbidden: unknown session' using errcode = '42501'; end if;
    if v_session.status = 'completed' then
        return jsonb_build_object(
            'sessionId', v_session.id,
            'actualMinutes', v_session.actual_minutes,
            'creditedMinutes', v_session.credited_minutes,
            'plannedMinutes', v_session.planned_minutes,
            'isValid', v_session.is_valid,
            'endedAt', v_session.ended_at,
            'idempotent', true);
    end if;
    if v_session.status = 'cancelled' then
        raise exception 'focus_session_closed: the session was cancelled' using errcode = '55000';
    end if;
    if not exists (
        select 1 from public.devices d
        where d.id = v_session.device_id and d.user_id = v_uid and d.status = 'active'
    ) then
        raise exception 'forbidden: the session device is revoked' using errcode = '42501';
    end if;

    -- The server clock is authoritative; a client cannot claim extra minutes.
    v_elapsed := least(
        greatest(floor(extract(epoch from (now() - v_session.started_at)) / 60)::integer, 0),
        600
    );

    update public.focus_sessions
    set status = 'completed', ended_at = now(), actual_minutes = v_elapsed
    where id = v_session.id
    returning * into v_session;

    return jsonb_build_object(
        'sessionId', v_session.id,
        'actualMinutes', v_session.actual_minutes,
        'creditedMinutes', v_session.credited_minutes,
        'plannedMinutes', v_session.planned_minutes,
        'isValid', v_session.is_valid,
        'endedAt', v_session.ended_at,
        'idempotent', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Update rpc_complete_plan_task to verify credited_minutes
-- ---------------------------------------------------------------------------
create or replace function public.rpc_complete_plan_task(p_plan_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_uid uuid := auth.uid();
    v_pt public.daily_plan_tasks%rowtype;
    v_plan_status public.plan_status;
    v_focus integer;
begin
    if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;

    select * into v_pt from public.daily_plan_tasks
    where id = p_plan_task_id and user_id = v_uid
    for update;
    if not found then raise exception 'forbidden' using errcode = '42501'; end if;

    select status into v_plan_status from public.daily_plans
    where id = v_pt.plan_id and user_id = v_uid;

    if v_plan_status <> 'active' then
        raise exception 'plan_not_active: tasks can be completed only while the plan is active'
            using errcode = '55000';
    end if;
    if v_pt.completed_at is not null then
        return jsonb_build_object('completed', true, 'alreadyCompleted', true);
    end if;

    select coalesce(sum(fs.credited_minutes), 0) into v_focus
    from public.focus_sessions fs
    where fs.user_id = v_uid
      and fs.task_id = v_pt.task_id
      and fs.daily_plan_id = v_pt.plan_id
      and fs.is_valid;

    if v_focus < v_pt.required_focus_minutes then
        raise exception 'plan_requirements_unmet: % of % required focus minutes recorded',
            v_focus, v_pt.required_focus_minutes
            using errcode = '55000',
                  hint = 'Run a focus session linked to this task and plan, then complete the task.';
    end if;

    perform set_config('focusgate.rpc', 'on', true);
    update public.tasks set status = 'completed'
    where id = v_pt.task_id and user_id = v_uid;
    update public.daily_plan_tasks set completed_at = now() where id = v_pt.id;

    insert into public.daily_plan_events (plan_id, user_id, event_type, payload)
    values (v_pt.plan_id, v_uid, 'task_completed',
            jsonb_build_object('planTaskId', v_pt.id, 'focusMinutes', v_focus));

    return jsonb_build_object('completed', true, 'alreadyCompleted', false, 'focusMinutes', v_focus);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Update rpc_evaluate_unlock to compute focus coverage from credited_minutes
-- ---------------------------------------------------------------------------
create or replace function public.rpc_evaluate_unlock(
    p_plan_id uuid,
    p_device_id uuid,
    p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_uid uuid := auth.uid();
    v_plan public.daily_plans%rowtype;
    v_settings public.user_settings%rowtype;
    v_tz text;
    v_total_must integer;
    v_completed_must integer;
    v_focus_required integer;
    v_focus_done integer;
    v_bonus_completed integer;
    v_extra_focus integer;
    v_base integer;
    v_bonus integer;
    v_extra integer;
    v_bonus_cap integer;
    v_total integer;
    v_existing public.unlock_grants%rowtype;
    v_grant public.unlock_grants%rowtype;
    v_expires timestamptz;
begin
    if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
    if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 150 then
        raise exception 'invalid_input: idempotency key must be 8–150 characters'
            using errcode = '22023';
    end if;

    select * into v_plan from public.daily_plans where id = p_plan_id and user_id = v_uid;
    if not found then raise exception 'plan_not_found' using errcode = 'P0002'; end if;
    if v_plan.status <> 'completed' then
        raise exception 'plan_not_active: complete the plan before claiming the reward'
            using errcode = '55000';
    end if;
    if v_plan.plan_date > current_date then
        raise exception 'plan_not_active: the plan date is in the future' using errcode = '55000';
    end if;

    -- Serialize concurrent grant attempts for this plan (two devices, retries).
    perform pg_advisory_xact_lock(hashtextextended(v_plan.id::text, 0));

    if not exists (
        select 1 from public.devices d
        where d.id = p_device_id and d.user_id = v_uid and d.status = 'active'
    ) then
        raise exception 'forbidden: unknown or revoked device' using errcode = '42501';
    end if;

    -- Idempotent replay, bound to the same plan.
    select * into v_existing from public.unlock_grants
    where user_id = v_uid and idempotency_key = p_idempotency_key;
    if found then
        if v_existing.daily_plan_id <> p_plan_id then
            raise exception 'idempotency_conflict: key already used for another plan'
                using errcode = '22023';
        end if;
        return jsonb_build_object(
            'grantId', v_existing.id,
            'grantedMinutes', v_existing.granted_minutes,
            'remainingMinutes', v_existing.remaining_minutes,
            'idempotent', true,
            'breakdown', jsonb_build_object('base', 0, 'bonus', 0, 'extraFocus', 0,
                                            'cappedAt', v_existing.granted_minutes));
    end if;

    -- One base grant per plan, regardless of device or retry key.
    select * into v_existing from public.unlock_grants
    where daily_plan_id = v_plan.id and source = 'daily_plan_base';
    if found then
        return jsonb_build_object(
            'grantId', v_existing.id,
            'grantedMinutes', v_existing.granted_minutes,
            'remainingMinutes', v_existing.remaining_minutes,
            'idempotent', true,
            'breakdown', jsonb_build_object('base', 0, 'bonus', 0, 'extraFocus', 0,
                                            'cappedAt', v_existing.granted_minutes));
    end if;

    select * into v_settings from public.user_settings where user_id = v_uid;
    if not found then
        raise exception 'invalid_input: reward settings are missing' using errcode = 'P0002';
    end if;

    select count(*), count(pt.completed_at), coalesce(sum(pt.required_focus_minutes), 0)
      into v_total_must, v_completed_must, v_focus_required
    from public.daily_plan_tasks pt
    where pt.plan_id = v_plan.id and pt.kind = 'must_do';

    if v_total_must = 0 then
        raise exception 'plan_requirements_unmet: no Must Do tasks' using errcode = '55000';
    end if;
    if v_completed_must < v_total_must then
        raise exception 'plan_requirements_unmet: Must Do tasks are incomplete' using errcode = '55000';
    end if;

    select coalesce(sum(fs.credited_minutes), 0) into v_focus_done
    from public.focus_sessions fs
    join public.daily_plan_tasks pt
      on pt.task_id = fs.task_id and pt.plan_id = v_plan.id
    where fs.user_id = v_uid
      and fs.daily_plan_id = v_plan.id
      and fs.is_valid
      and pt.kind = 'must_do';

    -- Per-task verification using credited_minutes: aggregate focus cannot be redistributed.
    if exists (
        select 1
        from public.daily_plan_tasks pt
        where pt.plan_id = v_plan.id
          and pt.completed_at is not null
          and coalesce((
              select sum(fs.credited_minutes)
              from public.focus_sessions fs
              where fs.user_id = v_uid
                and fs.daily_plan_id = v_plan.id
                and fs.task_id = pt.task_id
                and fs.is_valid
          ), 0) < pt.required_focus_minutes
    ) then
        raise exception 'plan_requirements_unmet: a completed task has not met its focus requirement'
            using errcode = '55000';
    end if;

    select count(*) into v_bonus_completed
    from public.daily_plan_tasks pt
    where pt.plan_id = v_plan.id and pt.kind = 'bonus' and pt.completed_at is not null;

    v_extra_focus := greatest(v_focus_done - v_focus_required, 0);
    v_base := coalesce(v_settings.base_minutes, 30);
    v_bonus_cap := coalesce(v_settings.max_bonus_minutes, 30);
    v_bonus := least(v_bonus_completed * coalesce(v_settings.bonus_minutes_per_task, 5), v_bonus_cap);
    v_extra := least(
        (v_extra_focus / greatest(coalesce(v_settings.extra_focus_block_minutes, 50), 1))
            * coalesce(v_settings.extra_focus_reward_minutes, 5),
        greatest(v_bonus_cap - v_bonus, 0)
    );
    v_total := least(v_base + v_bonus + v_extra, coalesce(v_settings.daily_cap_minutes, 60));

    if v_total <= 0 then
        raise exception 'plan_requirements_unmet: computed reward is zero' using errcode = '55000';
    end if;

    select coalesce(timezone, 'UTC') into v_tz from public.profiles where id = v_uid;
    v_expires := ((v_plan.plan_date + 1)::timestamp + time '04:00') at time zone v_tz;
    if v_expires <= now() then
        raise exception 'plan_expired: the unlock window for this plan has passed'
            using errcode = '55000';
    end if;

    perform set_config('focusgate.rpc', 'on', true);

    insert into public.unlock_grants
        (user_id, daily_plan_id, device_id, granted_minutes, status, source,
         idempotency_key, valid_from, expires_at)
    values
        (v_uid, v_plan.id, p_device_id, v_total, 'active', 'daily_plan_base',
         p_idempotency_key, now(), v_expires)
    on conflict do nothing
    returning * into v_grant;

    if v_grant.id is null then
        select * into v_grant from public.unlock_grants
        where user_id = v_uid and idempotency_key = p_idempotency_key;
        return jsonb_build_object(
            'grantId', v_grant.id, 'grantedMinutes', v_grant.granted_minutes,
            'remainingMinutes', v_grant.remaining_minutes, 'idempotent', true,
            'breakdown', jsonb_build_object('base', v_base, 'bonus', v_bonus,
                                            'extraFocus', v_extra, 'cappedAt', v_total));
    end if;

    insert into public.reward_ledger
        (user_id, grant_id, delta_minutes, reason, reference_id, note, idempotency_key)
    values
        (v_uid, v_grant.id, v_total, 'grant', v_plan.id,
         'Daily plan ' || v_plan.plan_date, p_idempotency_key || ':grant');

    return jsonb_build_object(
        'grantId', v_grant.id, 'grantedMinutes', v_grant.granted_minutes,
        'remainingMinutes', v_grant.remaining_minutes, 'idempotent', false,
        'breakdown', jsonb_build_object('base', v_base, 'bonus', v_bonus,
                                        'extraFocus', v_extra, 'cappedAt', v_total));
end;
$$;

revoke all on function public.rpc_complete_focus_session(uuid) from public, anon;
revoke all on function public.rpc_complete_plan_task(uuid) from public, anon;
revoke all on function public.rpc_evaluate_unlock(uuid, uuid, text) from public, anon;

grant execute on function
    public.rpc_complete_focus_session(uuid),
    public.rpc_complete_plan_task(uuid),
    public.rpc_evaluate_unlock(uuid, uuid, text)
to authenticated;

commit;
