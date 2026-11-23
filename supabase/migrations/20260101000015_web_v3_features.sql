-- FocusGate Web v3: Settings & Goals, Time-blocking on daily_plan_tasks,
-- Weekly/Monthly Goals table, and Focus Session Notes.

begin;

alter table public.user_settings
    add column if not exists language text not null default 'en',
    add column if not exists daily_focus_goal_minutes integer not null default 120,
    add column if not exists daily_steps_goal integer not null default 8000,
    add column if not exists daily_sleep_goal_hours numeric(3, 1) not null default 7.5,
    add column if not exists target_weight_kg numeric(5, 2) default null;

alter table public.daily_plan_tasks
    add column if not exists scheduled_start text default null,
    add column if not exists scheduled_end text default null;

alter table public.focus_sessions
    add column if not exists note text default null;

create table if not exists public.goals (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    title text not null,
    period_type text not null default 'weekly' check (period_type in ('weekly', 'monthly')),
    target_value numeric(10, 2) not null default 1,
    current_value numeric(10, 2) not null default 0,
    unit text not null default 'hours',
    status text not null default 'active' check (status in ('active', 'completed', 'archived')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.goals enable row level security;

drop policy if exists goals_owner_all on public.goals;
create policy goals_owner_all
    on public.goals
    for all
    to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

create or replace function public.rpc_set_plan_task_schedule(
    p_plan_task_id uuid,
    p_start text,
    p_end text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_uid uuid := auth.uid();
begin
    if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;

    perform set_config('focusgate.rpc', 'on', true);

    update public.daily_plan_tasks
    set scheduled_start = nullif(trim(coalesce(p_start, '')), ''),
        scheduled_end = nullif(trim(coalesce(p_end, '')), '')
    where id = p_plan_task_id and user_id = v_uid;

    if not found then
        raise exception 'forbidden: unknown plan task' using errcode = '42501';
    end if;

    return jsonb_build_object('updated', true);
end;
$$;

create or replace function public.rpc_save_focus_session_note(
    p_session_id uuid,
    p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_uid uuid := auth.uid();
begin
    if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;

    perform set_config('focusgate.rpc', 'on', true);

    update public.focus_sessions
    set note = nullif(left(trim(coalesce(p_note, '')), 500), '')
    where id = p_session_id and user_id = v_uid;

    if not found then
        raise exception 'forbidden: unknown focus session' using errcode = '42501';
    end if;

    return jsonb_build_object('saved', true);
end;
$$;

revoke all on function public.rpc_set_plan_task_schedule(uuid, text, text) from public, anon;
grant execute on function public.rpc_set_plan_task_schedule(uuid, text, text) to authenticated;

revoke all on function public.rpc_save_focus_session_note(uuid, text) from public, anon;
grant execute on function public.rpc_save_focus_session_note(uuid, text) to authenticated;

commit;
