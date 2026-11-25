-- FocusGate v4 Ecosystem Expansion:
-- 1. Strict Mode & Bedtime Gate flags + Partner Display Name on user_settings
-- 2. Plan Templates (plan_templates)
-- 3. Smart Recurring Task Rules (recurring_task_rules)
-- 4. Weekly Review Rituals (weekly_reviews)
-- 5. Accountability Partners & Cheers (accountability_partners, partner_cheers)

begin;

alter table public.user_settings
    add column if not exists strict_mode_enabled boolean not null default false,
    add column if not exists bedtime_enabled boolean not null default false,
    add column if not exists display_name text default null;

create table if not exists public.plan_templates (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    name text not null,
    description text not null default '',
    items_json jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.plan_templates enable row level security;

drop policy if exists plan_templates_owner_all on public.plan_templates;
create policy plan_templates_owner_all
    on public.plan_templates
    for all
    to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

create table if not exists public.recurring_task_rules (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    title text not null,
    category text not null default 'work',
    kind text not null default 'must_do' check (kind in ('must_do', 'should_do', 'bonus')),
    estimated_minutes integer not null default 30 check (estimated_minutes between 5 and 240),
    recurrence_type text not null default 'daily' check (recurrence_type in ('daily', 'weekdays', 'custom')),
    days_of_week integer[] not null default array[1,2,3,4,5],
    active boolean not null default true,
    last_generated_date date default null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.recurring_task_rules enable row level security;

drop policy if exists recurring_task_rules_owner_all on public.recurring_task_rules;
create policy recurring_task_rules_owner_all
    on public.recurring_task_rules
    for all
    to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

create table if not exists public.weekly_reviews (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    week_start date not null,
    proudest_win text not null default '',
    reflection_note text not null default '',
    triaged_count integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (user_id, week_start)
);

alter table public.weekly_reviews enable row level security;

drop policy if exists weekly_reviews_owner_all on public.weekly_reviews;
create policy weekly_reviews_owner_all
    on public.weekly_reviews
    for all
    to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

create table if not exists public.accountability_partners (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    partner_user_id uuid references auth.users(id) on delete cascade,
    invite_code text not null unique,
    status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.accountability_partners enable row level security;

drop policy if exists accountability_partners_member_select on public.accountability_partners;
create policy accountability_partners_member_select
    on public.accountability_partners
    for select
    to authenticated
    using (user_id = auth.uid() or partner_user_id = auth.uid());

drop policy if exists accountability_partners_owner_write on public.accountability_partners;
create policy accountability_partners_owner_write
    on public.accountability_partners
    for all
    to authenticated
    using (user_id = auth.uid() or partner_user_id = auth.uid())
    with check (user_id = auth.uid() or partner_user_id = auth.uid());

create table if not exists public.partner_cheers (
    id uuid primary key default gen_random_uuid(),
    from_user_id uuid not null references auth.users(id) on delete cascade,
    to_user_id uuid not null references auth.users(id) on delete cascade,
    message text not null default 'Keep going!',
    created_at timestamptz not null default now()
);

alter table public.partner_cheers enable row level security;

drop policy if exists partner_cheers_member_all on public.partner_cheers;
create policy partner_cheers_member_all
    on public.partner_cheers
    for all
    to authenticated
    using (from_user_id = auth.uid() or to_user_id = auth.uid())
    with check (from_user_id = auth.uid());

-- RPC: update v4 settings safely
create or replace function public.rpc_update_v4_settings(
    p_strict_mode_enabled boolean default null,
    p_bedtime_enabled boolean default null,
    p_display_name text default null
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

    insert into public.user_settings (user_id) values (v_uid) on conflict (user_id) do nothing;

    update public.user_settings
    set strict_mode_enabled = coalesce(p_strict_mode_enabled, strict_mode_enabled),
        bedtime_enabled = coalesce(p_bedtime_enabled, bedtime_enabled),
        display_name = case
            when p_display_name is not null then nullif(left(trim(p_display_name), 48), '')
            else display_name
        end,
        updated_at = now()
    where user_id = v_uid;

    return jsonb_build_object('updated', true);
end;
$$;

-- RPC: create partner invite code (e.g. FG-A7K2M9)
create or replace function public.rpc_create_partner_invite()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_uid uuid := auth.uid();
    v_code text;
begin
    if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;

    v_code := 'FG-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

    insert into public.accountability_partners (user_id, invite_code, status)
    values (v_uid, v_code, 'pending');

    return jsonb_build_object('invite_code', v_code);
end;
$$;

-- RPC: accept partner invite code
create or replace function public.rpc_accept_partner_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_uid uuid := auth.uid();
    v_row public.accountability_partners%rowtype;
begin
    if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;

    select * into v_row
    from public.accountability_partners
    where invite_code = upper(trim(coalesce(p_code, '')))
      and status = 'pending'
    limit 1;

    if not found then
        raise exception 'Invalid or expired invite code' using errcode = '22023';
    end if;

    if v_row.user_id = v_uid then
        raise exception 'Cannot accept your own invite code' using errcode = '22023';
    end if;

    update public.accountability_partners
    set partner_user_id = v_uid,
        status = 'accepted',
        updated_at = now()
    where id = v_row.id;

    return jsonb_build_object('paired', true, 'partner_user_id', v_row.user_id);
end;
$$;

-- RPC: privacy-preserving partner live status (no task titles exposed)
create or replace function public.rpc_get_partner_statuses()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_uid uuid := auth.uid();
    v_result jsonb := '[]'::jsonb;
begin
    if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;

    select coalesce(jsonb_agg(item), '[]'::jsonb)
    into v_result
    from (
        select jsonb_build_object(
            'partnershipId', ap.id,
            'partnerUserId', peer.peer_id,
            'displayName', coalesce(us.display_name, 'Focus Partner'),
            'gateStatus', case
                when exists (
                    select 1 from public.focus_sessions fs
                    where fs.user_id = peer.peer_id and fs.status = 'running'
                ) then 'focusing'
                when exists (
                    select 1 from public.daily_plans dp
                    where dp.user_id = peer.peer_id
                      and dp.plan_date = current_date
                      and dp.status in ('confirmed', 'active')
                ) then 'locked'
                else 'open'
            end,
            'remainingTasks', coalesce((
                select count(*)::int
                from public.daily_plan_tasks dpt
                join public.daily_plans dp on dp.id = dpt.plan_id
                join public.tasks t on t.id = dpt.task_id
                where dp.user_id = peer.peer_id
                  and dp.plan_date = current_date
                  and t.status <> 'completed'
            ), 0),
            'completedToday', coalesce((
                select count(*)::int
                from public.daily_plan_tasks dpt
                join public.daily_plans dp on dp.id = dpt.plan_id
                join public.tasks t on t.id = dpt.task_id
                where dp.user_id = peer.peer_id
                  and dp.plan_date = current_date
                  and t.status = 'completed'
            ), 0),
            'lastCheer', (
                select jsonb_build_object('message', pc.message, 'createdAt', pc.created_at)
                from public.partner_cheers pc
                where pc.from_user_id = peer.peer_id and pc.to_user_id = v_uid
                order by pc.created_at desc
                limit 1
            )
        ) as item
        from public.accountability_partners ap
        cross join lateral (
            select case when ap.user_id = v_uid then ap.partner_user_id else ap.user_id end as peer_id
        ) peer
        left join public.user_settings us on us.user_id = peer.peer_id
        where (ap.user_id = v_uid or ap.partner_user_id = v_uid)
          and ap.status = 'accepted'
          and peer.peer_id is not null
    ) rows;

    return v_result;
end;
$$;

-- RPC: send partner cheer
create or replace function public.rpc_send_partner_cheer(
    p_partner_user_id uuid,
    p_message text default 'Cụng ly! Giữ vững phong độ nhé!'
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

    if not exists (
        select 1 from public.accountability_partners ap
        where ap.status = 'accepted'
          and ((ap.user_id = v_uid and ap.partner_user_id = p_partner_user_id)
            or (ap.partner_user_id = v_uid and ap.user_id = p_partner_user_id))
    ) then
        raise exception 'Not paired with this user' using errcode = '42501';
    end if;

    insert into public.partner_cheers (from_user_id, to_user_id, message)
    values (v_uid, p_partner_user_id, left(trim(coalesce(p_message, 'Keep going!')), 160));

    return jsonb_build_object('sent', true);
end;
$$;

revoke all on function public.rpc_update_v4_settings(boolean, boolean, text) from public, anon;
grant execute on function public.rpc_update_v4_settings(boolean, boolean, text) to authenticated;

revoke all on function public.rpc_create_partner_invite() from public, anon;
grant execute on function public.rpc_create_partner_invite() to authenticated;

revoke all on function public.rpc_accept_partner_invite(text) from public, anon;
grant execute on function public.rpc_accept_partner_invite(text) to authenticated;

revoke all on function public.rpc_get_partner_statuses() from public, anon;
grant execute on function public.rpc_get_partner_statuses() to authenticated;

revoke all on function public.rpc_send_partner_cheer(uuid, text) from public, anon;
grant execute on function public.rpc_send_partner_cheer(uuid, text) to authenticated;

commit;
