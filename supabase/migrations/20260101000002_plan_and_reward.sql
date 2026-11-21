-- =============================================================================
-- FocusGate – 0002 plan lifecycle, focus validation and reward engine
--
-- All functions are SECURITY DEFINER and re-check auth.uid() + ownership, because
-- RLS is bypassed inside the definer. Clients never receive the service role key
-- and cannot write unlock_grants / reward_ledger directly (see 0001).
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Guards: only RPCs may move a plan through its lifecycle.
-- ---------------------------------------------------------------------------
create or replace function public.fn_require_rpc_context()
returns void
language plpgsql
as $$
begin
    if coalesce(current_setting('focusgate.rpc', true), '') <> 'on' then
        raise exception 'This change must be performed through a FocusGate RPC.'
            using errcode = '42501';
    end if;
end;
$$;

create or replace function public.fn_guard_daily_plan_transition()
returns trigger
language plpgsql
as $$
begin
    if new.user_id <> old.user_id then
        raise exception 'forbidden: cannot change plan owner' using errcode = '42501';
    end if;

    if new.status is distinct from old.status
        or new.confirmed_at is distinct from old.confirmed_at
        or new.activated_at is distinct from old.activated_at
        or new.completed_at is distinct from old.completed_at then
        perform public.fn_require_rpc_context();
    end if;

    if new.plan_date <> old.plan_date and old.status <> 'draft' then
        raise exception 'plan_not_active: plan date is frozen after confirmation'
            using errcode = '55000';
    end if;

    if new.status is distinct from old.status then
        if not (
            (old.status = 'draft' and new.status in ('confirmed', 'skipped'))
            or (old.status = 'confirmed' and new.status in ('active', 'skipped'))
            or (old.status = 'active' and new.status in ('completed', 'skipped'))
        ) then
            raise exception 'invalid plan transition: % -> %', old.status, new.status
                using errcode = '22023';
        end if;
    end if;

    return new;
end;
$$;

create trigger trg_daily_plans_guard
    before update on public.daily_plans
    for each row execute function public.fn_guard_daily_plan_transition();

create or replace function public.fn_guard_plan_task()
returns trigger
language plpgsql
as $$
declare
    v_status public.plan_status;
begin
    select p.status into v_status
    from public.daily_plans p
    where p.id = coalesce(new.plan_id, old.plan_id);

    if v_status is null then
        raise exception 'plan_not_found' using errcode = 'P0002';
    end if;

    if tg_op = 'DELETE' then
        -- Removing a committed Must Do is never a silent operation. Draft plans
        -- can be edited; afterwards only the audited amendment RPC is allowed.
        if v_status <> 'draft' then
            raise exception 'plan_not_active: tasks cannot be removed from a % plan', v_status
                using errcode = '55000';
        end if;
        return old;
    end if;

    if tg_op = 'INSERT' then
        -- RLS already limits client inserts to draft plans. Privileged imports
        -- (seed/backfill) must still announce themselves explicitly.
        if v_status <> 'draft' then
            perform public.fn_require_rpc_context();
        end if;
        return new;
    end if;

    if v_status <> 'draft' then
        perform public.fn_require_rpc_context();
        if new.user_id <> old.user_id then
            raise exception 'forbidden: cannot change plan task owner' using errcode = '42501';
        end if;
        if new.plan_id <> old.plan_id or new.task_id <> old.task_id then
            raise exception 'forbidden: plan task identity is immutable' using errcode = '42501';
        end if;
    end if;

    return new;
end;
$$;

create trigger trg_daily_plan_tasks_guard
    before insert or update or delete on public.daily_plan_tasks
    for each row execute function public.fn_guard_plan_task();

-- ---------------------------------------------------------------------------
-- Planning RPCs
-- ---------------------------------------------------------------------------
create or replace function public.rpc_create_daily_plan(p_plan_date date default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_uid uuid := auth.uid();
    v_tz text;
    v_date date;
    v_id uuid;
begin
    if v_uid is null then
        raise exception 'not_authenticated' using errcode = '42501';
    end if;

    select timezone into v_tz from public.profiles where id = v_uid;
    v_date := coalesce(p_plan_date, (now() at time zone coalesce(v_tz, 'UTC'))::date);

    if v_date < (now() at time zone coalesce(v_tz, 'UTC'))::date - 1 then
        raise exception 'invalid_input: cannot create a plan more than one day in the past'
            using errcode = '22023';
    end if;

    insert into public.daily_plans (user_id, plan_date)
    values (v_uid, v_date)
    on conflict (user_id, plan_date) do nothing
    returning id into v_id;

    if v_id is null then
        select id into v_id from public.daily_plans where user_id = v_uid and plan_date = v_date;
        return jsonb_build_object('planId', v_id, 'created', false);
    end if;

    insert into public.daily_plan_events (plan_id, user_id, event_type)
    values (v_id, v_uid, 'created');

    return jsonb_build_object('planId', v_id, 'created', true);
end;
$$;

create or replace function public.rpc_add_plan_task(
    p_plan_id uuid,
    p_task_id uuid,
    p_kind public.task_kind default null,
    p_planned_start timestamptz default null,
    p_planned_minutes integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_uid uuid := auth.uid();
    v_plan public.daily_plans%rowtype;
    v_task public.tasks%rowtype;
    v_kind public.task_kind;
    v_order integer;
    v_id uuid;
begin
    if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;

    select * into v_plan from public.daily_plans
    where id = p_plan_id and user_id = v_uid
    for update;
    if not found then raise exception 'plan_not_found' using errcode = 'P0002'; end if;
    if v_plan.status <> 'draft' then
        raise exception 'plan_not_active: only draft plans can be edited' using errcode = '55000';
    end if;

    select * into v_task from public.tasks where id = p_task_id and user_id = v_uid;
    if not found then
        raise exception 'forbidden: task does not belong to the user' using errcode = '42501';
    end if;
    if v_task.status in ('completed', 'cancelled') then
        raise exception 'invalid_input: a % task cannot be planned', v_task.status
            using errcode = '22023';
    end if;

    v_kind := coalesce(p_kind, v_task.kind);
    perform set_config('focusgate.rpc', 'on', true);

    select coalesce(max(sort_order), 0) + 1 into v_order
    from public.daily_plan_tasks where plan_id = p_plan_id;

    insert into public.daily_plan_tasks
        (plan_id, task_id, user_id, kind, required_focus_minutes, planned_start, planned_minutes, sort_order)
    values
        (p_plan_id, p_task_id, v_uid, v_kind, v_task.required_focus_minutes, p_planned_start,
         coalesce(p_planned_minutes, greatest(v_task.estimated_minutes, 1)), v_order)
    on conflict (plan_id, task_id) do nothing
    returning id into v_id;

    if v_id is null then
        select id into v_id from public.daily_plan_tasks
        where plan_id = p_plan_id and task_id = p_task_id;
        return jsonb_build_object('planTaskId', v_id, 'created', false);
    end if;

    insert into public.daily_plan_events (plan_id, user_id, event_type, payload)
    values (p_plan_id, v_uid, 'task_added',
            jsonb_build_object('taskId', p_task_id, 'kind', v_kind));

    return jsonb_build_object('planTaskId', v_id, 'created', true);
end;
$$;

create or replace function public.rpc_remove_plan_task(p_plan_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_uid uuid := auth.uid();
    v_pt public.daily_plan_tasks%rowtype;
    v_plan public.daily_plans%rowtype;
begin
    if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;

    select * into v_pt from public.daily_plan_tasks
    where id = p_plan_task_id and user_id = v_uid
    for update;
    if not found then raise exception 'forbidden' using errcode = '42501'; end if;

    select * into v_plan from public.daily_plans where id = v_pt.plan_id and user_id = v_uid;
    if v_plan.status <> 'draft' then
        raise exception 'plan_not_active: tasks cannot be removed from a % plan', v_plan.status
            using errcode = '55000';
    end if;

    delete from public.daily_plan_tasks where id = v_pt.id;

    insert into public.daily_plan_events (plan_id, user_id, event_type, payload)
    values (v_pt.plan_id, v_uid, 'task_removed',
            jsonb_build_object('planTaskId', v_pt.id, 'taskId', v_pt.task_id, 'kind', v_pt.kind));

    return jsonb_build_object('removed', true);
end;
$$;

create or replace function public.rpc_confirm_plan(p_plan_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_uid uuid := auth.uid();
    v_plan public.daily_plans%rowtype;
begin
    if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;

    select * into v_plan from public.daily_plans
    where id = p_plan_id and user_id = v_uid
    for update;
    if not found then raise exception 'plan_not_found' using errcode = 'P0002'; end if;

    if v_plan.status = 'confirmed' then
        return jsonb_build_object('status', v_plan.status, 'changed', false);
    end if;
    if v_plan.status <> 'draft' then
        raise exception 'invalid plan transition: % -> confirmed', v_plan.status
            using errcode = '22023';
    end if;
    if not exists (
        select 1 from public.daily_plan_tasks
        where plan_id = v_plan.id and kind = 'must_do'
    ) then
        raise exception 'plan_requirements_unmet: add at least one Must Do task'
            using errcode = '55000';
    end if;

    perform set_config('focusgate.rpc', 'on', true);
    update public.daily_plans
    set status = 'confirmed', confirmed_at = now()
    where id = v_plan.id;

    insert into public.daily_plan_events (plan_id, user_id, event_type)
    values (v_plan.id, v_uid, 'confirmed');

    return jsonb_build_object('status', 'confirmed', 'changed', true);
end;
$$;

create or replace function public.rpc_activate_plan(p_plan_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_uid uuid := auth.uid();
    v_plan public.daily_plans%rowtype;
begin
    if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;

    select * into v_plan from public.daily_plans
    where id = p_plan_id and user_id = v_uid
    for update;
    if not found then raise exception 'plan_not_found' using errcode = 'P0002'; end if;

    if v_plan.status = 'active' then
        return jsonb_build_object('status', v_plan.status, 'changed', false);
    end if;
    if v_plan.status <> 'confirmed' then
        raise exception 'invalid plan transition: % -> active', v_plan.status
            using errcode = '22023';
    end if;
    if not exists (
        select 1 from public.daily_plan_tasks
        where plan_id = v_plan.id and kind = 'must_do'
    ) then
        raise exception 'plan_requirements_unmet: no Must Do tasks' using errcode = '55000';
    end if;

    perform set_config('focusgate.rpc', 'on', true);
    update public.daily_plans
    set status = 'active', activated_at = now()
    where id = v_plan.id;

    insert into public.daily_plan_events (plan_id, user_id, event_type)
    values (v_plan.id, v_uid, 'activated');

    return jsonb_build_object('status', 'active', 'changed', true);
end;
$$;

-- Downgrading a committed Must Do task is possible only with a written reason,
-- and the exception is written to immutable plan history.
create or replace function public.rpc_amend_plan_task(
    p_plan_task_id uuid,
    p_new_kind public.task_kind,
    p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_uid uuid := auth.uid();
    v_pt public.daily_plan_tasks%rowtype;
    v_plan public.daily_plans%rowtype;
    v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
    if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;

    select * into v_pt from public.daily_plan_tasks
    where id = p_plan_task_id and user_id = v_uid
    for update;
    if not found then raise exception 'forbidden' using errcode = '42501'; end if;

    select * into v_plan from public.daily_plans where id = v_pt.plan_id and user_id = v_uid;
    if v_plan.status in ('completed', 'skipped') then
        raise exception 'plan_not_active: the plan is closed' using errcode = '55000';
    end if;
    if v_pt.kind = p_new_kind then
        return jsonb_build_object('changed', false, 'exception', false);
    end if;

    perform set_config('focusgate.rpc', 'on', true);

    if v_plan.status = 'draft' then
        update public.daily_plan_tasks set kind = p_new_kind where id = v_pt.id;
        insert into public.daily_plan_events (plan_id, user_id, event_type, payload)
        values (v_pt.plan_id, v_uid, 'task_kind_changed',
                jsonb_build_object('planTaskId', v_pt.id, 'from', v_pt.kind, 'to', p_new_kind));
        return jsonb_build_object('changed', true, 'exception', false);
    end if;

    if v_pt.kind = 'must_do' and p_new_kind <> 'must_do' then
        if v_reason is null or char_length(v_reason) < 5 then
            raise exception 'invalid_input: downgrading a committed Must Do requires a reason'
                using errcode = '22023';
        end if;

        update public.daily_plan_tasks set kind = p_new_kind where id = v_pt.id;
        insert into public.daily_plan_events (plan_id, user_id, event_type, reason, payload)
        values (v_pt.plan_id, v_uid, 'exception_granted', v_reason,
                jsonb_build_object('planTaskId', v_pt.id, 'from', v_pt.kind, 'to', p_new_kind));

        return jsonb_build_object('changed', true, 'exception', true);
    end if;

    update public.daily_plan_tasks set kind = p_new_kind where id = v_pt.id;
    insert into public.daily_plan_events (plan_id, user_id, event_type, payload)
    values (v_pt.plan_id, v_uid, 'task_kind_changed',
            jsonb_build_object('planTaskId', v_pt.id, 'from', v_pt.kind, 'to', p_new_kind));

    return jsonb_build_object('changed', true, 'exception', false);
end;
$$;

-- A task is completed only when the user asks for it *and* the required valid
-- focus time exists. Reaching the end of a timer alone never completes a task.
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

    select coalesce(sum(fs.actual_minutes), 0) into v_focus
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

create or replace function public.rpc_complete_plan(p_plan_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_uid uuid := auth.uid();
    v_plan public.daily_plans%rowtype;
    v_pending integer;
begin
    if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;

    select * into v_plan from public.daily_plans
    where id = p_plan_id and user_id = v_uid
    for update;
    if not found then raise exception 'plan_not_found' using errcode = 'P0002'; end if;
    if v_plan.status = 'completed' then
        return jsonb_build_object('status', 'completed', 'changed', false);
    end if;
    if v_plan.status <> 'active' then
        raise exception 'invalid plan transition: % -> completed', v_plan.status
            using errcode = '22023';
    end if;

    select count(*) into v_pending
    from public.daily_plan_tasks pt
    join public.tasks t on t.id = pt.task_id
    where pt.plan_id = v_plan.id
      and pt.kind = 'must_do'
      and (pt.completed_at is null or t.status <> 'completed');

    if v_pending > 0 then
        raise exception 'plan_requirements_unmet: % Must Do task(s) still open', v_pending
            using errcode = '55000';
    end if;

    perform set_config('focusgate.rpc', 'on', true);
    update public.daily_plans
    set status = 'completed', completed_at = now()
    where id = v_plan.id;

    insert into public.daily_plan_events (plan_id, user_id, event_type)
    values (v_plan.id, v_uid, 'completed');

    return jsonb_build_object('status', 'completed', 'changed', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Reward engine
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
    if p_idempotency_key is null or char_length(p_idempotency_key) < 8 then
        raise exception 'invalid_input: idempotency key must be at least 8 characters'
            using errcode = '22023';
    end if;

    select * into v_plan from public.daily_plans where id = p_plan_id and user_id = v_uid;
    if not found then raise exception 'plan_not_found' using errcode = 'P0002'; end if;
    if v_plan.status not in ('active', 'completed') then
        raise exception 'plan_not_active: plan status is %', v_plan.status using errcode = '55000';
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

    -- Idempotent replay.
    select * into v_existing from public.unlock_grants
    where user_id = v_uid and idempotency_key = p_idempotency_key;
    if found then
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

-- Consumption is serialized with a row lock and an idempotency key, so two
-- devices (or retries) cannot spend the same minutes twice.
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
    if p_idempotency_key is null or char_length(p_idempotency_key) < 8 then
        raise exception 'invalid_input: idempotency key must be at least 8 characters'
            using errcode = '22023';
    end if;

    if not exists (
        select 1 from public.devices d
        where d.id = p_device_id and d.user_id = v_uid and d.status = 'active'
    ) then
        raise exception 'forbidden: unknown or revoked device' using errcode = '42501';
    end if;

    select * into v_existing from public.reward_ledger
    where user_id = v_uid and idempotency_key = p_idempotency_key || ':consume';
    if found then
        select * into v_grant from public.unlock_grants where id = p_grant_id and user_id = v_uid;
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

    update public.unlock_grants set status = 'revoked'
    where device_id = p_device_id and user_id = v_uid and status = 'active';
    get diagnostics v_revoked = row_count;

    return jsonb_build_object('revoked', true, 'revokedGrants', v_revoked);
end;
$$;

create or replace function public.fn_expire_unlock_grants()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_count integer;
begin
    perform set_config('focusgate.rpc', 'on', true);
    update public.unlock_grants set status = 'expired'
    where status = 'active' and expires_at <= now();
    get diagnostics v_count = row_count;
    return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------
revoke all on function public.rpc_create_daily_plan(date) from public, anon;
revoke all on function public.rpc_add_plan_task(uuid, uuid, public.task_kind, timestamptz, integer) from public, anon;
revoke all on function public.rpc_remove_plan_task(uuid) from public, anon;
revoke all on function public.rpc_confirm_plan(uuid) from public, anon;
revoke all on function public.rpc_activate_plan(uuid) from public, anon;
revoke all on function public.rpc_amend_plan_task(uuid, public.task_kind, text) from public, anon;
revoke all on function public.rpc_complete_plan_task(uuid) from public, anon;
revoke all on function public.rpc_complete_plan(uuid) from public, anon;
revoke all on function public.rpc_evaluate_unlock(uuid, uuid, text) from public, anon;
revoke all on function public.rpc_consume_unlock_minutes(uuid, uuid, integer, text) from public, anon;
revoke all on function public.rpc_revoke_device(uuid) from public, anon;
revoke all on function public.fn_expire_unlock_grants() from public, anon;
revoke all on function public.fn_require_rpc_context() from public, anon;
-- The guard trigger runs as the caller; authenticated needs EXECUTE to emit the
-- explicit "must go through an RPC" error instead of a generic permission error.
-- Calling it directly only ever raises; it cannot set the transaction flag.
grant execute on function public.fn_require_rpc_context() to authenticated;

grant execute on function public.rpc_create_daily_plan(date) to authenticated;
grant execute on function public.rpc_add_plan_task(uuid, uuid, public.task_kind, timestamptz, integer) to authenticated;
grant execute on function public.rpc_remove_plan_task(uuid) to authenticated;
grant execute on function public.rpc_confirm_plan(uuid) to authenticated;
grant execute on function public.rpc_activate_plan(uuid) to authenticated;
grant execute on function public.rpc_amend_plan_task(uuid, public.task_kind, text) to authenticated;
grant execute on function public.rpc_complete_plan_task(uuid) to authenticated;
grant execute on function public.rpc_complete_plan(uuid) to authenticated;
grant execute on function public.rpc_evaluate_unlock(uuid, uuid, text) to authenticated;
grant execute on function public.rpc_consume_unlock_minutes(uuid, uuid, integer, text) to authenticated;
grant execute on function public.rpc_revoke_device(uuid) to authenticated;

commit;
