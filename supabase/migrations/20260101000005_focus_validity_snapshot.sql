-- =============================================================================
-- FocusGate – 0005 focus validity snapshot & credit-cap compatibility guard
--
-- Resolves Milestone A1.1 P1.2 (minimum-valid-duration vs. credit-cap contradiction):
--   1. Adds a session-level `min_valid_minutes` snapshot to `public.focus_sessions`
--      so changing `user_settings.min_valid_focus_minutes` mid-session never
--      retroactively alters an active session's validity threshold.
--   2. Backfills existing rows safely without promoting historically invalid
--      sessions or mutating historical `is_valid` / `credited_minutes`.
--   3. Enforces at session start (`rpc_start_focus_session`) that
--      `planned_minutes * 2 >= min_valid_minutes`, rejecting impossible
--      configurations where the 2x credit cap is below the minimum threshold.
--   4. Updates `fn_validate_focus_session` and `rpc_complete_focus_session` to
--      validate against the session's snapshotted `min_valid_minutes`.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Add session-level min_valid_minutes snapshot & safely backfill history
-- ---------------------------------------------------------------------------
alter table public.focus_sessions
    add column if not exists min_valid_minutes integer not null default 1
        check (min_valid_minutes between 1 and 120);

-- Temporarily disable user triggers on focus_sessions during backfill so
-- immutable completed/cancelled sessions preserve their exact historical
-- `is_valid`, `actual_minutes`, and `credited_minutes` values.
alter table public.focus_sessions disable trigger user;

update public.focus_sessions fs
set min_valid_minutes = case
    -- For running/paused sessions, snapshot the user's current setting
    -- clamped to the session's 2x credit cap so active sessions remain consistent.
    when fs.status in ('running', 'paused') then
        greatest(
            1,
            least(
                120,
                coalesce(
                    (select s.min_valid_focus_minutes
                     from public.user_settings s
                     where s.user_id = fs.user_id),
                    1
                ),
                fs.planned_minutes * 2
            )
        )
    -- For historical valid completed sessions, ensure the stored threshold does
    -- not exceed their actual recorded duration.
    when fs.status = 'completed' and fs.is_valid then
        greatest(
            1,
            least(
                120,
                coalesce(
                    (select s.min_valid_focus_minutes
                     from public.user_settings s
                     where s.user_id = fs.user_id),
                    1
                ),
                greatest(fs.actual_minutes, 1)
            )
        )
    -- For historical invalid or cancelled sessions, record the user setting snapshot
    -- while keeping `is_valid = false` and `credited_minutes = 0`.
    else
        greatest(
            1,
            least(
                120,
                coalesce(
                    (select s.min_valid_focus_minutes
                     from public.user_settings s
                     where s.user_id = fs.user_id),
                    1
                )
            )
        )
end;

alter table public.focus_sessions enable trigger user;

-- ---------------------------------------------------------------------------
-- 2. Authoritative validation trigger using session-level min_valid_minutes
-- ---------------------------------------------------------------------------
create or replace function public.fn_validate_focus_session()
returns trigger
language plpgsql
as $$
declare
    v_user_min_valid integer := 1;
    v_min_valid integer := 1;
    v_elapsed_minutes integer;
begin
    -- On INSERT, if min_valid_minutes was not explicitly provided (or on direct
    -- privileged seed insert), snapshot from user_settings; on UPDATE, preserve
    -- the session's snapshotted min_valid_minutes.
    if tg_op = 'INSERT' then
        select s.min_valid_focus_minutes into v_user_min_valid
        from public.user_settings s
        where s.user_id = new.user_id;

        if new.min_valid_minutes is null or new.min_valid_minutes < 1 then
            new.min_valid_minutes := greatest(coalesce(v_user_min_valid, 1), 1);
        end if;
    else
        new.min_valid_minutes := coalesce(old.min_valid_minutes, new.min_valid_minutes, 1);
    end if;

    v_min_valid := greatest(coalesce(new.min_valid_minutes, 1), 1);
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

        -- Validate against the session's snapshotted min_valid_minutes AND ensure
        -- that even for a legacy row where planned_minutes * 2 < min_valid_minutes,
        -- a session cannot be marked valid if its maximum possible credit (2x planned)
        -- is below the minimum threshold.
        new.is_valid := new.actual_minutes >= v_min_valid
            and (new.planned_minutes * 2) >= v_min_valid
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
-- 3. Update rpc_start_focus_session: snapshot min_valid_minutes & reject
--    impossible planned_minutes * 2 < min_valid_minutes configurations
-- ---------------------------------------------------------------------------
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
    v_min_valid integer := 1;
    v_min_planned integer := 1;
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
            'minValidMinutes', v_session.min_valid_minutes,
            'idempotent', true);
    end if;

    -- Read the user's current minimum valid focus setting and validate that the
    -- session's 2x credit cap can reach that threshold.
    select coalesce(s.min_valid_focus_minutes, 1) into v_min_valid
    from public.user_settings s
    where s.user_id = v_uid;

    v_min_valid := greatest(coalesce(v_min_valid, 1), 1);
    v_min_planned := (v_min_valid + 1) / 2;

    if p_planned_minutes * 2 < v_min_valid then
        raise exception 'invalid_input: planned duration (% min, max credit % min) cannot satisfy minimum valid focus duration (% min; plan at least % min)',
            p_planned_minutes,
            p_planned_minutes * 2,
            v_min_valid,
            v_min_planned
            using errcode = '22023';
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
         planned_minutes, min_valid_minutes, actual_minutes, credited_minutes, status, started_at)
    values
        (v_uid, p_task_id, p_daily_plan_id, p_device_id, p_client_id, p_mode,
         p_planned_minutes, v_min_valid, 0, 0, 'running', now())
    returning * into v_session;

    return jsonb_build_object(
        'sessionId', v_session.id,
        'status', 'running',
        'startedAt', v_session.started_at,
        'plannedMinutes', v_session.planned_minutes,
        'minValidMinutes', v_session.min_valid_minutes,
        'idempotent', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Update rpc_complete_focus_session to return minValidMinutes in payload
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
            'minValidMinutes', v_session.min_valid_minutes,
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
        'minValidMinutes', v_session.min_valid_minutes,
        'isValid', v_session.is_valid,
        'endedAt', v_session.ended_at,
        'idempotent', false);
end;
$$;

revoke all on function public.rpc_start_focus_session(uuid, text, integer, public.focus_mode, uuid, uuid) from public, anon;
revoke all on function public.rpc_complete_focus_session(uuid) from public, anon;

grant execute on function
    public.rpc_start_focus_session(uuid, text, integer, public.focus_mode, uuid, uuid),
    public.rpc_complete_focus_session(uuid)
to authenticated;

commit;
