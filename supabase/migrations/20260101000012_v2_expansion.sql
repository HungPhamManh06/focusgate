-- FocusGate v2 expansion: Earned Time, Streak Freeze, Unlock Pass,
-- Whitelist Focus Mode, Weekday/Weekend Profiles, Daily Rollover,
-- and Windows/Android discovered apps sync.

begin;

alter table public.user_settings
    add column if not exists earned_minutes_balance integer not null default 0,
    add column if not exists streak_freeze_count integer not null default 0,
    add column if not exists frozen_dates text[] not null default '{}',
    add column if not exists unlock_pass_until timestamptz default null,
    add column if not exists whitelist_focus_mode boolean not null default false,
    add column if not exists allowed_apps text[] not null default '{}',
    add column if not exists allowed_domains text[] not null default '{}',
    add column if not exists blocked_domains text[] not null default '{youtube.com,facebook.com,tiktok.com,instagram.com,reddit.com}',
    add column if not exists weekday_bedtime_start text default '23:00',
    add column if not exists weekday_bedtime_end text default '06:00',
    add column if not exists weekend_bedtime_start text default '00:00',
    add column if not exists weekend_bedtime_end text default '07:00',
    add column if not exists weekend_relaxed_mode boolean not null default false,
    add column if not exists last_daily_review_date text default null;

create table if not exists public.device_discovered_apps (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    device_id uuid not null references public.devices(id) on delete cascade,
    identifier text not null,
    display_name text not null,
    platform text not null default 'windows',
    last_seen_at timestamptz not null default now(),
    unique (device_id, identifier)
);

alter table public.device_discovered_apps enable row level security;

drop policy if exists device_discovered_apps_owner_all on public.device_discovered_apps;
create policy device_discovered_apps_owner_all
    on public.device_discovered_apps
    for all
    to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

create or replace function public.rpc_grant_earned_time(
    p_minutes integer,
    p_reason text default 'task_completed'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_uid uuid := auth.uid();
    v_add integer := greatest(1, least(coalesce(p_minutes, 0), 120));
    v_balance integer;
begin
    if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;

    insert into public.user_settings (user_id) values (v_uid)
    on conflict (user_id) do nothing;

    update public.user_settings
    set earned_minutes_balance = earned_minutes_balance + v_add,
        updated_at = now()
    where user_id = v_uid
    returning earned_minutes_balance into v_balance;

    return jsonb_build_object(
        'added', v_add,
        'reason', coalesce(p_reason, 'task_completed'),
        'earnedMinutesBalance', v_balance
    );
end;
$$;

create or replace function public.rpc_activate_unlock_pass(p_minutes integer default 10)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_uid uuid := auth.uid();
    v_cost integer := greatest(5, least(coalesce(p_minutes, 10), 60));
    v_settings public.user_settings%rowtype;
    v_until timestamptz;
begin
    if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;

    insert into public.user_settings (user_id) values (v_uid)
    on conflict (user_id) do nothing;

    select * into v_settings
    from public.user_settings
    where user_id = v_uid
    for update;

    if v_settings.earned_minutes_balance < v_cost then
        raise exception 'insufficient_earned_time: need % minutes, have %', v_cost, v_settings.earned_minutes_balance
            using errcode = '55000';
    end if;

    v_until := greatest(coalesce(v_settings.unlock_pass_until, now()), now()) + make_interval(mins => v_cost);

    update public.user_settings
    set earned_minutes_balance = earned_minutes_balance - v_cost,
        unlock_pass_until = v_until,
        updated_at = now()
    where user_id = v_uid;

    return jsonb_build_object(
        'consumedMinutes', v_cost,
        'earnedMinutesBalance', v_settings.earned_minutes_balance - v_cost,
        'unlockPassUntil', v_until
    );
end;
$$;

create or replace function public.rpc_buy_streak_freeze()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_uid uuid := auth.uid();
    v_cost integer := 30;
    v_settings public.user_settings%rowtype;
begin
    if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;

    insert into public.user_settings (user_id) values (v_uid)
    on conflict (user_id) do nothing;

    select * into v_settings
    from public.user_settings
    where user_id = v_uid
    for update;

    if v_settings.earned_minutes_balance < v_cost then
        raise exception 'insufficient_earned_time: need % minutes for a Streak Freeze', v_cost
            using errcode = '55000';
    end if;

    update public.user_settings
    set earned_minutes_balance = earned_minutes_balance - v_cost,
        streak_freeze_count = streak_freeze_count + 1,
        updated_at = now()
    where user_id = v_uid;

    return jsonb_build_object(
        'earnedMinutesBalance', v_settings.earned_minutes_balance - v_cost,
        'streakFreezeCount', v_settings.streak_freeze_count + 1
    );
end;
$$;

create or replace function public.rpc_use_streak_freeze(p_day text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_uid uuid := auth.uid();
    v_settings public.user_settings%rowtype;
    v_dates text[];
begin
    if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
    if p_day is null or p_day !~ '^\d{4}-\d{2}-\d{2}$' then
        raise exception 'invalid_date_format' using errcode = '22023';
    end if;

    select * into v_settings
    from public.user_settings
    where user_id = v_uid
    for update;

    if not found or v_settings.streak_freeze_count < 1 then
        raise exception 'no_streak_freeze_available' using errcode = '55000';
    end if;

    if p_day = any(v_settings.frozen_dates) then
        return jsonb_build_object(
            'streakFreezeCount', v_settings.streak_freeze_count,
            'frozenDates', v_settings.frozen_dates
        );
    end if;

    v_dates := array_append(v_settings.frozen_dates, p_day);

    update public.user_settings
    set streak_freeze_count = streak_freeze_count - 1,
        frozen_dates = v_dates,
        updated_at = now()
    where user_id = v_uid;

    return jsonb_build_object(
        'streakFreezeCount', v_settings.streak_freeze_count - 1,
        'frozenDates', v_dates
    );
end;
$$;

create or replace function public.rpc_rollover_incomplete_tasks(
    p_from_date date,
    p_to_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_uid uuid := auth.uid();
    v_from_plan_id uuid;
    v_to_plan_id uuid;
    v_moved integer := 0;
    v_row record;
begin
    if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;

    select id into v_from_plan_id
    from public.daily_plans
    where user_id = v_uid and plan_date = p_from_date;

    if v_from_plan_id is null then
        return jsonb_build_object('moved', 0);
    end if;

    select id into v_to_plan_id
    from public.daily_plans
    where user_id = v_uid and plan_date = p_to_date;

    if v_to_plan_id is null then
        insert into public.daily_plans (user_id, plan_date, status)
        values (v_uid, p_to_date, 'draft')
        returning id into v_to_plan_id;
    end if;

    perform set_config('focusgate.rpc', 'on', true);

    for v_row in
        select pt.task_id, pt.kind, pt.required_focus_minutes
        from public.daily_plan_tasks pt
        join public.tasks t on t.id = pt.task_id
        where pt.plan_id = v_from_plan_id
          and pt.user_id = v_uid
          and t.status <> 'completed'
          and not exists (
              select 1 from public.daily_plan_tasks cur
              where cur.plan_id = v_to_plan_id and cur.task_id = pt.task_id
          )
        order by pt.sort_order asc, pt.created_at asc
    loop
        insert into public.daily_plan_tasks (plan_id, user_id, task_id, kind, required_focus_minutes)
        values (v_to_plan_id, v_uid, v_row.task_id, v_row.kind, v_row.required_focus_minutes)
        on conflict (plan_id, task_id) do nothing;
        v_moved := v_moved + 1;
    end loop;

    return jsonb_build_object('moved', v_moved, 'targetPlanId', v_to_plan_id);
end;
$$;

revoke all on function public.rpc_grant_earned_time(integer, text) from public, anon;
grant execute on function public.rpc_grant_earned_time(integer, text) to authenticated;

revoke all on function public.rpc_activate_unlock_pass(integer) from public, anon;
grant execute on function public.rpc_activate_unlock_pass(integer) to authenticated;

revoke all on function public.rpc_buy_streak_freeze() from public, anon;
grant execute on function public.rpc_buy_streak_freeze() to authenticated;

revoke all on function public.rpc_use_streak_freeze(text) from public, anon;
grant execute on function public.rpc_use_streak_freeze(text) to authenticated;

revoke all on function public.rpc_rollover_incomplete_tasks(date, date) from public, anon;
grant execute on function public.rpc_rollover_incomplete_tasks(date, date) to authenticated;

commit;
