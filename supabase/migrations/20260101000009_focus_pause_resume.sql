-- Migration 0009: Focus Session Pause / Resume (UX-008)
-- Adds server-authoritative pause tracking (`paused_at`, `paused_seconds`)
-- so paused wall-clock time never counts as verified focus time.

begin;

alter table public.focus_sessions
    add column if not exists paused_at timestamptz null,
    add column if not exists paused_seconds integer not null default 0;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'focus_sessions_paused_seconds_check'
          and conrelid = 'public.focus_sessions'::regclass
    ) then
        alter table public.focus_sessions
            add constraint focus_sessions_paused_seconds_check
            check (paused_seconds >= 0);
    end if;
end $$;

-- Update validation trigger so wall-clock elapsed clamp subtracts paused_seconds.
create or replace function public.fn_validate_focus_session()
returns trigger
language plpgsql
as $$
declare
    v_user_min_valid integer := 1;
    v_min_valid integer := 1;
    v_elapsed_minutes integer;
    v_paused_seconds integer := 0;
begin
    if tg_op = 'INSERT' then
        select s.min_valid_focus_minutes into v_user_min_valid
        from public.user_settings s
        where s.user_id = new.user_id;

        if new.min_valid_minutes is null or new.min_valid_minutes < 1 then
            new.min_valid_minutes := least(120, greatest(coalesce(v_user_min_valid, 1), 1));
        else
            new.min_valid_minutes := least(120, greatest(new.min_valid_minutes, 1));
        end if;
    else
        new.min_valid_minutes := coalesce(old.min_valid_minutes, new.min_valid_minutes, 1);
    end if;

    v_min_valid := greatest(coalesce(new.min_valid_minutes, 1), 1);
    v_paused_seconds := greatest(0, coalesce(new.paused_seconds, 0));
    new.paused_seconds := v_paused_seconds;
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
            floor(
                (extract(epoch from (new.ended_at - new.started_at)) - v_paused_seconds) / 60
            )::integer
        );

        if new.actual_minutes is null or new.actual_minutes < 0 then
            new.actual_minutes := 0;
        end if;
        if new.actual_minutes > v_elapsed_minutes + 1 then
            new.actual_minutes := least(v_elapsed_minutes, 600);
        end if;
        new.actual_minutes := least(greatest(new.actual_minutes, 0), 600);

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

create or replace function public.rpc_pause_focus_session(p_session_id uuid)
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

    if v_session.status in ('completed', 'cancelled') then
        raise exception 'focus_session_closed: the session is already %', v_session.status
            using errcode = '55000';
    end if;

    if not exists (
        select 1 from public.devices d
        where d.id = v_session.device_id and d.user_id = v_uid and d.status = 'active'
    ) then
        raise exception 'forbidden: the session device is revoked' using errcode = '42501';
    end if;

    if v_session.status = 'paused' then
        return jsonb_build_object(
            'sessionId', v_session.id,
            'status', 'paused',
            'pausedAt', v_session.paused_at,
            'pausedSeconds', v_session.paused_seconds,
            'interruptionCount', v_session.interruption_count,
            'idempotent', true
        );
    end if;

    update public.focus_sessions
    set status = 'paused',
        paused_at = now(),
        interruption_count = interruption_count + 1
    where id = v_session.id
    returning * into v_session;

    return jsonb_build_object(
        'sessionId', v_session.id,
        'status', v_session.status,
        'pausedAt', v_session.paused_at,
        'pausedSeconds', v_session.paused_seconds,
        'interruptionCount', v_session.interruption_count,
        'idempotent', false
    );
end;
$$;

create or replace function public.rpc_resume_focus_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_uid uuid := auth.uid();
    v_session public.focus_sessions%rowtype;
    v_extra_pause integer := 0;
begin
    if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;

    select * into v_session from public.focus_sessions
    where id = p_session_id and user_id = v_uid
    for update;
    if not found then raise exception 'forbidden: unknown session' using errcode = '42501'; end if;

    if v_session.status in ('completed', 'cancelled') then
        raise exception 'focus_session_closed: the session is already %', v_session.status
            using errcode = '55000';
    end if;

    if not exists (
        select 1 from public.devices d
        where d.id = v_session.device_id and d.user_id = v_uid and d.status = 'active'
    ) then
        raise exception 'forbidden: the session device is revoked' using errcode = '42501';
    end if;

    if v_session.status = 'running' then
        return jsonb_build_object(
            'sessionId', v_session.id,
            'status', 'running',
            'pausedSeconds', v_session.paused_seconds,
            'interruptionCount', v_session.interruption_count,
            'idempotent', true
        );
    end if;

    if v_session.paused_at is not null then
        v_extra_pause := greatest(
            0,
            floor(extract(epoch from (now() - v_session.paused_at)))::integer
        );
    end if;

    update public.focus_sessions
    set status = 'running',
        paused_at = null,
        paused_seconds = coalesce(paused_seconds, 0) + v_extra_pause
    where id = v_session.id
    returning * into v_session;

    return jsonb_build_object(
        'sessionId', v_session.id,
        'status', v_session.status,
        'pausedSeconds', v_session.paused_seconds,
        'interruptionCount', v_session.interruption_count,
        'idempotent', false
    );
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
    v_extra_pause integer := 0;
    v_total_paused integer := 0;
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

    if v_session.status = 'paused' and v_session.paused_at is not null then
        v_extra_pause := greatest(
            0,
            floor(extract(epoch from (now() - v_session.paused_at)))::integer
        );
    end if;

    v_total_paused := coalesce(v_session.paused_seconds, 0) + v_extra_pause;

    -- The server clock is authoritative; paused time is excluded from active focus.
    v_elapsed := least(
        greatest(
            floor(
                (extract(epoch from (now() - v_session.started_at)) - v_total_paused) / 60
            )::integer,
            0
        ),
        600
    );

    update public.focus_sessions
    set status = 'completed',
        ended_at = now(),
        paused_at = null,
        paused_seconds = v_total_paused,
        actual_minutes = v_elapsed
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

revoke all on function public.rpc_pause_focus_session(uuid) from public, anon;
revoke all on function public.rpc_resume_focus_session(uuid) from public, anon;
revoke all on function public.rpc_complete_focus_session(uuid) from public, anon;

grant execute on function
    public.rpc_pause_focus_session(uuid),
    public.rpc_resume_focus_session(uuid),
    public.rpc_complete_focus_session(uuid)
to authenticated;

commit;
