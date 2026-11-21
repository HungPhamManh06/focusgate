-- =============================================================================
-- FocusGate – 0003 backend hardening
--
-- This migration closes privilege and integrity gaps found in the Phase 0
-- schema:
--   1. Reward settings are read-only to clients (users cannot raise their cap).
--   2. Focus sessions are server-owned: start/complete/cancel go through RPCs,
--      elapsed minutes are derived from the server clock, direct writes are
--      revoked, and one open session per user is enforced.
--   3. Composite foreign keys make cross-tenant references impossible at the
--      storage layer (task/plan/device/grant ownership).
--   4. Plan event history is RPC-only; clients cannot forge audit records.
--   5. Grant/spend idempotency keys are bound to the original request; a reused
--      key with different parameters raises idempotency_conflict.
--   6. The auth bootstrap trigger is safe for long or blank display names.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Authentication bootstrap + profile validation
-- ---------------------------------------------------------------------------
create or replace function public.fn_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_name text;
begin
    v_name := coalesce(
        nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
        nullif(btrim(split_part(coalesce(new.email, ''), '@', 1)), ''),
        'FocusGate user'
    );
    v_name := left(v_name, 80);

    insert into public.profiles (id, display_name)
    values (new.id, v_name)
    on conflict (id) do nothing;

    insert into public.user_settings (user_id)
    values (new.id)
    on conflict (user_id) do nothing;

    return new;
end;
$$;

create or replace function public.fn_validate_profile()
returns trigger
language plpgsql
as $$
begin
    new.display_name := btrim(new.display_name);
    if new.display_name is null or char_length(new.display_name) = 0 then
        raise exception 'invalid_input: display name cannot be blank' using errcode = '22023';
    end if;

    if not exists (select 1 from pg_timezone_names tz where tz.name = new.timezone) then
        raise exception 'invalid_input: unknown IANA timezone %', new.timezone
            using errcode = '22023';
    end if;

    return new;
end;
$$;

drop trigger if exists trg_profiles_validate on public.profiles;
create trigger trg_profiles_validate
    before insert or update on public.profiles
    for each row execute function public.fn_validate_profile();

-- ---------------------------------------------------------------------------
-- 2. Reward configuration is server-controlled
-- ---------------------------------------------------------------------------
drop policy if exists user_settings_update on public.user_settings;
revoke update, insert, delete on public.user_settings from authenticated, anon;

-- ---------------------------------------------------------------------------
-- 3. Cross-tenant integrity: composite keys and foreign keys
-- ---------------------------------------------------------------------------
alter table public.tasks
    add constraint tasks_id_user_unique unique (id, user_id);
alter table public.daily_plans
    add constraint daily_plans_id_user_unique unique (id, user_id);
alter table public.block_rules
    add constraint block_rules_id_user_unique unique (id, user_id);
alter table public.unlock_grants
    add constraint unlock_grants_id_user_unique unique (id, user_id);

-- Replace single-column plan/task FKs with composite owner-checked FKs.
alter table public.daily_plan_tasks
    drop constraint if exists daily_plan_tasks_plan_id_fkey,
    drop constraint if exists daily_plan_tasks_task_id_fkey,
    add constraint daily_plan_tasks_plan_owner
        foreign key (plan_id, user_id) references public.daily_plans (id, user_id)
        on delete cascade,
    add constraint daily_plan_tasks_task_owner
        foreign key (task_id, user_id) references public.tasks (id, user_id)
        on delete restrict;

alter table public.daily_plan_events
    drop constraint if exists daily_plan_events_plan_id_fkey,
    drop constraint if exists daily_plan_events_actor_device_id_fkey,
    add constraint daily_plan_events_plan_owner
        foreign key (plan_id, user_id) references public.daily_plans (id, user_id)
        on delete cascade,
    add constraint daily_plan_events_actor_device_owner
        foreign key (actor_device_id, user_id) references public.devices (id, user_id)
        on delete set null (actor_device_id);

-- A focus session cannot point at another user's task or plan.
-- The column-list SET NULL syntax (PostgreSQL 15+) keeps user_id intact.
alter table public.focus_sessions
    drop constraint if exists focus_sessions_task_id_fkey,
    drop constraint if exists focus_sessions_daily_plan_id_fkey,
    add constraint focus_sessions_task_owner
        foreign key (task_id, user_id) references public.tasks (id, user_id)
        on delete set null (task_id),
    add constraint focus_sessions_plan_owner
        foreign key (daily_plan_id, user_id) references public.daily_plans (id, user_id)
        on delete set null (daily_plan_id);

alter table public.unlock_grants
    drop constraint if exists unlock_grants_daily_plan_id_fkey,
    add constraint unlock_grants_plan_owner
        foreign key (daily_plan_id, user_id) references public.daily_plans (id, user_id)
        on delete cascade;

alter table public.device_sync_states
    drop constraint if exists device_sync_states_device_id_fkey,
    add constraint device_sync_states_device_owner
        foreign key (device_id, user_id) references public.devices (id, user_id)
        on delete cascade;

-- Usage rows and ledger entries cannot point at another user's grant or rule.
alter table public.usage_events
    drop constraint if exists usage_events_grant_id_fkey,
    drop constraint if exists usage_events_block_rule_id_fkey,
    add constraint usage_events_grant_owner
        foreign key (grant_id, user_id) references public.unlock_grants (id, user_id)
        on delete set null (grant_id),
    add constraint usage_events_block_rule_owner
        foreign key (block_rule_id, user_id) references public.block_rules (id, user_id)
        on delete set null (block_rule_id);

alter table public.reward_ledger
    drop constraint if exists reward_ledger_grant_id_fkey,
    add constraint reward_ledger_grant_owner
        foreign key (grant_id, user_id) references public.unlock_grants (id, user_id)
        on delete cascade;

-- Usage events can only reference the user's own grant and block rule. The
-- composite device FK already covers the device.
create or replace function public.fn_guard_usage_event_ownership()
returns trigger
language plpgsql
as $$
begin
    if new.grant_id is not null and not exists (
        select 1 from public.unlock_grants g
        where g.id = new.grant_id and g.user_id = new.user_id
    ) then
        raise exception 'forbidden: grant does not belong to the user' using errcode = '42501';
    end if;

    if new.block_rule_id is not null and not exists (
        select 1 from public.block_rules r
        where r.id = new.block_rule_id and r.user_id = new.user_id
    ) then
        raise exception 'forbidden: block rule does not belong to the user' using errcode = '42501';
    end if;

    return new;
end;
$$;

drop trigger if exists trg_usage_events_owner on public.usage_events;
create trigger trg_usage_events_owner
    before insert or update on public.usage_events
    for each row execute function public.fn_guard_usage_event_ownership();

-- RLS defence in depth for draft plan composition.
drop policy if exists daily_plan_tasks_insert on public.daily_plan_tasks;
create policy daily_plan_tasks_insert on public.daily_plan_tasks
    for insert to authenticated
    with check (
        user_id = auth.uid()
        and exists (
            select 1 from public.daily_plans p
            where p.id = daily_plan_tasks.plan_id
              and p.user_id = auth.uid()
              and p.status = 'draft'
        )
        and exists (
            select 1 from public.tasks t
            where t.id = daily_plan_tasks.task_id and t.user_id = auth.uid()
        )
    );

drop policy if exists daily_plan_tasks_update on public.daily_plan_tasks;
create policy daily_plan_tasks_update on public.daily_plan_tasks
    for update to authenticated
    using (user_id = auth.uid())
    with check (
        user_id = auth.uid()
        and exists (
            select 1 from public.tasks t
            where t.id = daily_plan_tasks.task_id and t.user_id = auth.uid()
        )
        and exists (
            select 1 from public.daily_plans p
            where p.id = daily_plan_tasks.plan_id and p.user_id = auth.uid()
        )
    );

-- Audit events are written by SECURITY DEFINER RPCs only.
drop policy if exists daily_plan_events_insert on public.daily_plan_events;
revoke insert, update, delete on public.daily_plan_events from authenticated, anon;

-- ---------------------------------------------------------------------------
-- 4. Focus sessions become server-owned
-- ---------------------------------------------------------------------------
-- Any abandoned legacy open sessions are closed before the unique index.
with ranked as (
    select id,
           row_number() over (partition by user_id order by started_at desc) as rn
    from public.focus_sessions
    where status in ('running', 'paused')
)
update public.focus_sessions f
set status = 'cancelled', ended_at = now(), actual_minutes = 0, is_valid = false
from ranked r
where f.id = r.id and r.rn > 1;

create unique index ux_focus_sessions_one_open
    on public.focus_sessions (user_id)
    where status in ('running', 'paused');

-- A completed/cancelled session is immutable evidence.
create or replace function public.fn_guard_focus_session_transition()
returns trigger
language plpgsql
as $$
begin
    if tg_op = 'UPDATE' and old.status in ('completed', 'cancelled') then
        raise exception 'focus_session_closed: a % session cannot be modified', old.status
            using errcode = '55000';
    end if;
    return new;
end;
$$;

drop trigger if exists trg_focus_sessions_guard on public.focus_sessions;
create trigger trg_focus_sessions_guard
    before update on public.focus_sessions
    for each row execute function public.fn_guard_focus_session_transition();

drop policy if exists focus_sessions_insert on public.focus_sessions;
drop policy if exists focus_sessions_update on public.focus_sessions;
drop policy if exists focus_sessions_delete on public.focus_sessions;
revoke insert, update, delete, truncate on public.focus_sessions from authenticated, anon;
grant select on public.focus_sessions to authenticated;

create or replace function public.rpc_start_focus_session(
    p_device_id uuid,
    p_client_id text,
    p_planned_minutes integer,
    p_mode public.focus_mode default 'custom',
    p_task_id uuid default null,
    p_daily_plan_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_uid uuid := auth.uid();
    v_task public.tasks%rowtype;
    v_plan public.daily_plans%rowtype;
    v_session public.focus_sessions%rowtype;
begin
    if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
    if p_client_id is null or char_length(p_client_id) not between 8 and 100 then
        raise exception 'invalid_input: client id must be 8–100 characters' using errcode = '22023';
    end if;
    if p_planned_minutes is null or p_planned_minutes not between 1 and 600 then
        raise exception 'invalid_input: planned minutes must be between 1 and 600'
            using errcode = '22023';
    end if;

    if not exists (
        select 1 from public.devices d
        where d.id = p_device_id and d.user_id = v_uid and d.status = 'active'
    ) then
        raise exception 'forbidden: unknown or revoked device' using errcode = '42501';
    end if;

    -- Serialize starts per user so retries and double taps are deterministic.
    perform pg_advisory_xact_lock(hashtextextended('focus-start:' || v_uid::text, 0));

    -- Replay of the same client-generated id is idempotent.
    select * into v_session from public.focus_sessions
    where device_id = p_device_id and client_id = p_client_id and user_id = v_uid;
    if found then
        return jsonb_build_object(
            'sessionId', v_session.id,
            'status', v_session.status,
            'startedAt', v_session.started_at,
            'plannedMinutes', v_session.planned_minutes,
            'idempotent', true);
    end if;

    if exists (
        select 1 from public.focus_sessions
        where user_id = v_uid and status in ('running', 'paused')
    ) then
        raise exception 'focus_session_active: finish or cancel the open session first'
            using errcode = '55000';
    end if;

    if p_task_id is not null then
        select * into v_task from public.tasks
        where id = p_task_id and user_id = v_uid;
        if not found then
            raise exception 'forbidden: task does not belong to the user' using errcode = '42501';
        end if;
        if v_task.status in ('completed', 'cancelled') then
            raise exception 'invalid_input: a % task cannot be focused on', v_task.status
                using errcode = '22023';
        end if;
    end if;

    if p_daily_plan_id is not null then
        select * into v_plan from public.daily_plans
        where id = p_daily_plan_id and user_id = v_uid;
        if not found then raise exception 'plan_not_found' using errcode = 'P0002'; end if;
        if v_plan.status in ('completed', 'skipped') then
            raise exception 'plan_not_active: the plan is closed' using errcode = '55000';
        end if;
        if p_task_id is null then
            raise exception 'invalid_input: a plan-linked session needs a task'
                using errcode = '22023';
        end if;
        if not exists (
            select 1 from public.daily_plan_tasks pt
            where pt.plan_id = p_daily_plan_id
              and pt.task_id = p_task_id
              and pt.user_id = v_uid
        ) then
            raise exception 'invalid_input: task is not part of this plan'
                using errcode = '22023';
        end if;
    end if;

    insert into public.focus_sessions
        (user_id, task_id, daily_plan_id, device_id, client_id, mode,
         planned_minutes, actual_minutes, status, started_at)
    values
        (v_uid, p_task_id, p_daily_plan_id, p_device_id, p_client_id, p_mode,
         p_planned_minutes, 0, 'running', now())
    returning * into v_session;

    return jsonb_build_object(
        'sessionId', v_session.id,
        'status', 'running',
        'startedAt', v_session.started_at,
        'plannedMinutes', v_session.planned_minutes,
        'idempotent', false);
end;
$$;

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
            'sessionId', v_session.id, 'actualMinutes', v_session.actual_minutes,
            'isValid', v_session.is_valid, 'endedAt', v_session.ended_at,
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
        'sessionId', v_session.id, 'actualMinutes', v_session.actual_minutes,
        'isValid', v_session.is_valid, 'endedAt', v_session.ended_at,
        'idempotent', false);
end;
$$;

create or replace function public.rpc_cancel_focus_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_uid uuid := auth.uid();
    v_session public.focus_sessions%rowtype;
begin
    if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;

    select * into v_session from public.focus_sessions
    where id = p_session_id and user_id = v_uid
    for update;
    if not found then raise exception 'forbidden: unknown session' using errcode = '42501'; end if;
    if v_session.status = 'cancelled' then
        return jsonb_build_object('sessionId', v_session.id, 'cancelled', true, 'idempotent', true);
    end if;
    if v_session.status = 'completed' then
        raise exception 'focus_session_closed: the session is already completed'
            using errcode = '55000';
    end if;

    update public.focus_sessions
    set status = 'cancelled', ended_at = now(), actual_minutes = 0, is_valid = false
    where id = v_session.id;

    return jsonb_build_object('sessionId', v_session.id, 'cancelled', true, 'idempotent', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Reward engine: bind idempotency keys, require a completed plan
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

    select coalesce(sum(fs.actual_minutes), 0) into v_focus_done
    from public.focus_sessions fs
    join public.daily_plan_tasks pt
      on pt.task_id = fs.task_id and pt.plan_id = v_plan.id
    where fs.user_id = v_uid
      and fs.daily_plan_id = v_plan.id
      and fs.is_valid
      and pt.kind = 'must_do';

    -- Per-task verification: aggregate focus cannot be redistributed.
    if exists (
        select 1
        from public.daily_plan_tasks pt
        where pt.plan_id = v_plan.id
          and pt.completed_at is not null
          and coalesce((
              select sum(fs.actual_minutes)
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

create or replace function public.rpc_consume_unlock_minutes(
    p_grant_id uuid,
    p_device_id uuid,
    p_minutes integer,
    p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_uid uuid := auth.uid();
    v_grant public.unlock_grants%rowtype;
    v_existing public.reward_ledger%rowtype;
begin
    if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
    if p_minutes is null or p_minutes <= 0 then
        raise exception 'invalid_input: minutes must be positive' using errcode = '22023';
    end if;
    if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 150 then
        raise exception 'invalid_input: idempotency key must be 8–150 characters'
            using errcode = '22023';
    end if;

    -- Serialize identical retries before reading the ledger.
    perform pg_advisory_xact_lock(
        hashtextextended('spend:' || v_uid::text || ':' || p_idempotency_key, 0)
    );

    if not exists (
        select 1 from public.devices d
        where d.id = p_device_id and d.user_id = v_uid and d.status = 'active'
    ) then
        raise exception 'forbidden: unknown or revoked device' using errcode = '42501';
    end if;

    select * into v_existing from public.reward_ledger
    where user_id = v_uid and idempotency_key = p_idempotency_key || ':consume';

    if found then
        if v_existing.grant_id is distinct from p_grant_id
            or v_existing.delta_minutes <> -p_minutes
            or v_existing.reference_id is distinct from p_device_id then
            raise exception 'idempotency_conflict: key already used with different parameters'
                using errcode = '22023';
        end if;

        select * into v_grant from public.unlock_grants
        where id = p_grant_id and user_id = v_uid;
        return jsonb_build_object(
            'grantId', p_grant_id,
            'consumedMinutes', v_grant.consumed_minutes,
            'remainingMinutes', v_grant.remaining_minutes,
            'idempotent', true);
    end if;

    select * into v_grant from public.unlock_grants
    where id = p_grant_id and user_id = v_uid
    for update;

    if not found then raise exception 'grant_not_found' using errcode = 'P0002'; end if;

    -- Re-check the device after the row lock: revocation wins over a race.
    if not exists (
        select 1 from public.devices d
        where d.id = p_device_id and d.user_id = v_uid and d.status = 'active'
    ) then
        raise exception 'forbidden: device was revoked' using errcode = '42501';
    end if;

    if v_grant.status = 'revoked' then
        raise exception 'grant_not_found: grant was revoked' using errcode = '55000';
    end if;
    if v_grant.status = 'expired' or v_grant.expires_at <= now() then
        perform set_config('focusgate.rpc', 'on', true);
        update public.unlock_grants set status = 'expired'
        where id = v_grant.id and status = 'active';
        raise exception 'grant_expired' using errcode = '55000';
    end if;
    if v_grant.status = 'consumed' or v_grant.remaining_minutes <= 0 then
        raise exception 'grant_exhausted' using errcode = '55000';
    end if;
    if p_minutes > v_grant.remaining_minutes then
        raise exception 'grant_exhausted: % minutes requested, % remaining',
            p_minutes, v_grant.remaining_minutes using errcode = '55000';
    end if;

    perform set_config('focusgate.rpc', 'on', true);

    update public.unlock_grants
    set consumed_minutes = consumed_minutes + p_minutes,
        status = case
            when granted_minutes - (consumed_minutes + p_minutes) <= 0 then 'consumed'::public.grant_status
            else 'active'::public.grant_status
        end
    where id = v_grant.id
    returning * into v_grant;

    insert into public.reward_ledger
        (user_id, grant_id, delta_minutes, reason, reference_id, note, idempotency_key)
    values
        (v_uid, v_grant.id, -p_minutes, 'consume', p_device_id,
         'Entertainment usage', p_idempotency_key || ':consume');

    return jsonb_build_object(
        'grantId', v_grant.id,
        'consumedMinutes', v_grant.consumed_minutes,
        'remainingMinutes', v_grant.remaining_minutes,
        'idempotent', false);
end;
$$;

create or replace function public.rpc_revoke_device(p_device_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_uid uuid := auth.uid();
    v_revoked integer;
begin
    if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;

    perform set_config('focusgate.rpc', 'on', true);

    update public.devices set status = 'revoked'
    where id = p_device_id and user_id = v_uid;
    if not found then raise exception 'forbidden: unknown device' using errcode = '42501'; end if;

    -- A revoked device cannot leave a session open that the server would later
    -- complete on its behalf.
    update public.focus_sessions
    set status = 'cancelled', ended_at = now(), actual_minutes = 0, is_valid = false
    where user_id = v_uid and device_id = p_device_id
      and status in ('running', 'paused');

    update public.unlock_grants set status = 'revoked'
    where device_id = p_device_id and user_id = v_uid and status = 'active';
    get diagnostics v_revoked = row_count;

    return jsonb_build_object('revoked', true, 'revokedGrants', v_revoked);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Function privileges for the new RPCs
-- ---------------------------------------------------------------------------
revoke all on function public.rpc_start_focus_session(uuid, text, integer, public.focus_mode, uuid, uuid)
    from public, anon;
revoke all on function public.rpc_complete_focus_session(uuid) from public, anon;
revoke all on function public.rpc_cancel_focus_session(uuid) from public, anon;

grant execute on function public.rpc_start_focus_session(uuid, text, integer, public.focus_mode, uuid, uuid)
    to authenticated;
grant execute on function public.rpc_complete_focus_session(uuid) to authenticated;
grant execute on function public.rpc_cancel_focus_session(uuid) to authenticated;

commit;
