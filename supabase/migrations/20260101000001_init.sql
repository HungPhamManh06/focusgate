-- =============================================================================
-- FocusGate – 0001 initial schema
-- PostgreSQL 15+ (Supabase). UUID keys, RLS on every user table, audit history.
-- No service-role key is referenced here; SECURITY DEFINER helpers are used
-- only for server-validated reward and plan transitions.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Enumerated domains
-- ---------------------------------------------------------------------------
create type public.device_platform as enum ('windows', 'android', 'web');
create type public.device_status as enum ('active', 'revoked');
create type public.task_kind as enum ('must_do', 'should_do', 'bonus');
create type public.task_priority as enum ('low', 'medium', 'high', 'urgent');
create type public.task_category as enum ('work', 'study', 'health', 'personal', 'finance', 'other');
create type public.task_status as enum ('todo', 'in_progress', 'completed', 'cancelled');
create type public.plan_status as enum ('draft', 'confirmed', 'active', 'completed', 'skipped');
create type public.plan_event_type as enum (
    'created', 'task_added', 'task_removed', 'task_kind_changed', 'task_completed',
    'confirmed', 'activated', 'completed', 'exception_granted', 'skipped'
);
create type public.focus_mode as enum ('pomodoro_25_5', 'pomodoro_50_10', 'custom', 'open_ended');
create type public.focus_session_status as enum ('running', 'paused', 'completed', 'cancelled');
create type public.block_rule_type as enum ('block', 'allow');
create type public.block_category as enum ('social', 'video', 'games', 'entertainment', 'other');
create type public.block_action as enum ('overlay', 'minimize', 'terminate', 'notify');
create type public.grant_status as enum ('active', 'consumed', 'expired', 'revoked');
create type public.unlock_source as enum ('daily_plan_base', 'bonus_task', 'extra_focus', 'adjustment');
create type public.ledger_reason as enum ('grant', 'consume', 'expire', 'revoke', 'adjustment');

-- ---------------------------------------------------------------------------
-- Shared helper: updated_at
-- ---------------------------------------------------------------------------
create or replace function public.fn_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles / user_settings
-- ---------------------------------------------------------------------------
create table public.profiles (
    id          uuid primary key references auth.users (id) on delete cascade,
    display_name text not null default 'FocusGate user'
        check (char_length(display_name) between 1 and 80),
    avatar_url  text check (avatar_url is null or char_length(avatar_url) <= 2048),
    timezone    text not null default 'UTC' check (char_length(timezone) between 1 and 64),
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create table public.user_settings (
    user_id                     uuid primary key references public.profiles (id) on delete cascade,
    base_minutes                integer not null default 30  check (base_minutes between 0 and 1440),
    bonus_minutes_per_task      integer not null default 5   check (bonus_minutes_per_task between 0 and 180),
    extra_focus_block_minutes   integer not null default 50  check (extra_focus_block_minutes between 1 and 1440),
    extra_focus_reward_minutes  integer not null default 5   check (extra_focus_reward_minutes between 0 and 180),
    max_bonus_minutes           integer not null default 30  check (max_bonus_minutes between 0 and 600),
    daily_cap_minutes           integer not null default 60  check (daily_cap_minutes between 0 and 1440),
    min_valid_focus_minutes     integer not null default 1   check (min_valid_focus_minutes between 1 and 120),
    created_at                  timestamptz not null default now(),
    updated_at                  timestamptz not null default now()
);

create trigger trg_profiles_touch before update on public.profiles
    for each row execute function public.fn_touch_updated_at();
create trigger trg_user_settings_touch before update on public.user_settings
    for each row execute function public.fn_touch_updated_at();

-- Every new auth user gets a profile and default reward configuration.
create or replace function public.fn_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    insert into public.profiles (id, display_name)
    values (
        new.id,
        coalesce(
            nullif(new.raw_user_meta_data ->> 'display_name', ''),
            nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
            'FocusGate user'
        )
    )
    on conflict (id) do nothing;

    insert into public.user_settings (user_id)
    values (new.id)
    on conflict (user_id) do nothing;

    return new;
end;
$$;

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.fn_handle_new_user();

-- ---------------------------------------------------------------------------
-- devices
-- ---------------------------------------------------------------------------
create table public.devices (
    id           uuid primary key default gen_random_uuid(),
    user_id      uuid not null references public.profiles (id) on delete cascade,
    name         text not null check (char_length(name) between 1 and 80),
    platform     public.device_platform not null,
    os_version   text check (os_version is null or char_length(os_version) <= 64),
    app_version  text check (app_version is null or char_length(app_version) <= 64),
    public_key   text check (public_key is null or char_length(public_key) <= 4096),
    status       public.device_status not null default 'active',
    last_seen_at timestamptz,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now(),
    constraint devices_user_name_unique unique (user_id, name),
    -- Supports composite foreign keys, which enforce "device belongs to user"
    -- at the storage layer instead of relying on triggers.
    constraint devices_id_user_unique unique (id, user_id)
);

create index ix_devices_user_status on public.devices (user_id, status);

create trigger trg_devices_touch before update on public.devices
    for each row execute function public.fn_touch_updated_at();

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------
create table public.tasks (
    id                    uuid primary key default gen_random_uuid(),
    user_id               uuid not null references public.profiles (id) on delete cascade,
    title                 text not null check (char_length(title) between 1 and 200),
    description           text check (description is null or char_length(description) <= 5000),
    category              public.task_category not null default 'other',
    kind                  public.task_kind not null default 'should_do',
    priority              public.task_priority not null default 'medium',
    estimated_minutes     integer not null default 25 check (estimated_minutes between 0 and 1440),
    required_focus_minutes integer not null default 25 check (required_focus_minutes between 0 and 1440),
    due_date              timestamptz,
    status                public.task_status not null default 'todo',
    recurrence_rule       text check (recurrence_rule is null or char_length(recurrence_rule) <= 512),
    recurrence_parent_id  uuid references public.tasks (id) on delete set null,
    sort_order            integer not null default 0,
    completed_at          timestamptz,
    created_at            timestamptz not null default now(),
    updated_at            timestamptz not null default now()
);

create index ix_tasks_user_status on public.tasks (user_id, status);
create index ix_tasks_user_due on public.tasks (user_id, due_date) where due_date is not null;
create index ix_tasks_user_kind_status on public.tasks (user_id, kind, status);

create trigger trg_tasks_touch before update on public.tasks
    for each row execute function public.fn_touch_updated_at();

-- Completion timestamps are derived, never trusted from the client.
create or replace function public.fn_tasks_sync_completion()
returns trigger
language plpgsql
as $$
begin
    if new.status = 'completed' then
        new.completed_at := coalesce(new.completed_at, now());
    else
        new.completed_at := null;
    end if;
    return new;
end;
$$;

create trigger trg_tasks_completion
    before insert or update on public.tasks
    for each row execute function public.fn_tasks_sync_completion();

-- ---------------------------------------------------------------------------
-- daily plans and their audit trail
-- ---------------------------------------------------------------------------
create table public.daily_plans (
    id           uuid primary key default gen_random_uuid(),
    user_id      uuid not null references public.profiles (id) on delete cascade,
    plan_date    date not null,
    status       public.plan_status not null default 'draft',
    confirmed_at timestamptz,
    activated_at timestamptz,
    completed_at timestamptz,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now(),
    constraint daily_plans_user_date_unique unique (user_id, plan_date)
);

create index ix_daily_plans_user_status on public.daily_plans (user_id, status);

create trigger trg_daily_plans_touch before update on public.daily_plans
    for each row execute function public.fn_touch_updated_at();

create table public.daily_plan_tasks (
    id                     uuid primary key default gen_random_uuid(),
    plan_id                uuid not null references public.daily_plans (id) on delete cascade,
    task_id                uuid not null references public.tasks (id) on delete restrict,
    user_id                uuid not null references public.profiles (id) on delete cascade,
    kind                   public.task_kind not null,
    required_focus_minutes integer not null default 25 check (required_focus_minutes between 0 and 1440),
    planned_start          timestamptz,
    planned_minutes        integer not null default 25 check (planned_minutes between 0 and 1440),
    sort_order             integer not null default 0,
    completed_at           timestamptz,
    created_at             timestamptz not null default now(),
    updated_at             timestamptz not null default now(),
    constraint daily_plan_tasks_unique unique (plan_id, task_id)
);

create index ix_daily_plan_tasks_plan on public.daily_plan_tasks (plan_id, kind);
create index ix_daily_plan_tasks_user on public.daily_plan_tasks (user_id);

create trigger trg_daily_plan_tasks_touch before update on public.daily_plan_tasks
    for each row execute function public.fn_touch_updated_at();

create table public.daily_plan_events (
    id             uuid primary key default gen_random_uuid(),
    plan_id        uuid not null references public.daily_plans (id) on delete cascade,
    user_id        uuid not null references public.profiles (id) on delete cascade,
    event_type     public.plan_event_type not null,
    reason         text check (reason is null or char_length(reason) <= 500),
    payload        jsonb not null default '{}'::jsonb,
    actor_device_id uuid references public.devices (id) on delete set null,
    created_at     timestamptz not null default now()
);

create index ix_daily_plan_events_plan on public.daily_plan_events (plan_id, created_at desc);
create index ix_daily_plan_events_user on public.daily_plan_events (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- focus sessions
-- ---------------------------------------------------------------------------
create table public.focus_sessions (
    id                 uuid primary key default gen_random_uuid(),
    user_id            uuid not null references public.profiles (id) on delete cascade,
    task_id            uuid references public.tasks (id) on delete set null,
    daily_plan_id      uuid references public.daily_plans (id) on delete set null,
    device_id          uuid not null,
    client_id          text not null check (char_length(client_id) between 8 and 100),
    mode               public.focus_mode not null default 'custom',
    planned_minutes    integer not null default 25 check (planned_minutes between 1 and 600),
    actual_minutes     integer not null default 0 check (actual_minutes between 0 and 600),
    status             public.focus_session_status not null default 'running',
    started_at         timestamptz not null,
    ended_at           timestamptz,
    interruption_count integer not null default 0 check (interruption_count >= 0),
    is_valid           boolean not null default false,
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now(),
    constraint focus_sessions_client_unique unique (device_id, client_id),
    constraint focus_sessions_device_owner
        foreign key (device_id, user_id) references public.devices (id, user_id) on delete cascade
);

create index ix_focus_sessions_user_started on public.focus_sessions (user_id, started_at desc);
create index ix_focus_sessions_task on public.focus_sessions (task_id) where is_valid;
create index ix_focus_sessions_plan on public.focus_sessions (daily_plan_id) where is_valid;

create trigger trg_focus_sessions_touch before update on public.focus_sessions
    for each row execute function public.fn_touch_updated_at();

-- Valid focus is computed server-side: a client cannot post is_valid = true.
-- Claimed minutes longer than the wall clock are clamped before validation.
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

    v_min_valid := coalesce(v_min_valid, 1);
    new.is_valid := false;

    if new.ended_at is not null and new.ended_at < new.started_at then
        raise exception 'focus session ends before it starts' using errcode = '22007';
    end if;

    if new.status = 'completed' and new.ended_at is not null then
        v_elapsed_minutes := floor(extract(epoch from (new.ended_at - new.started_at)) / 60)::integer;
        if new.actual_minutes > v_elapsed_minutes + 1 then
            new.actual_minutes := greatest(v_elapsed_minutes, 0);
        end if;
        new.is_valid := new.actual_minutes >= v_min_valid
            and new.actual_minutes <= new.planned_minutes * 2
            and new.actual_minutes > 0;
    end if;

    return new;
end;
$$;

create trigger trg_focus_sessions_validate
    before insert or update on public.focus_sessions
    for each row execute function public.fn_validate_focus_session();

-- ---------------------------------------------------------------------------
-- app lock rules
-- ---------------------------------------------------------------------------
create table public.block_rules (
    id             uuid primary key default gen_random_uuid(),
    user_id        uuid not null references public.profiles (id) on delete cascade,
    device_id      uuid not null,
    platform       public.device_platform not null,
    rule_type      public.block_rule_type not null default 'block',
    identifier     text not null check (char_length(identifier) between 1 and 256),
    display_name   text not null check (char_length(display_name) between 1 and 200),
    category       public.block_category not null default 'other',
    action         public.block_action not null default 'overlay',
    is_enabled     boolean not null default true,
    policy_version integer not null default 1 check (policy_version >= 1),
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now(),
    constraint block_rules_device_identifier_unique unique (device_id, identifier),
    constraint block_rules_device_owner
        foreign key (device_id, user_id) references public.devices (id, user_id) on delete cascade
);

create index ix_block_rules_user_device on public.block_rules (user_id, device_id);

create trigger trg_block_rules_touch before update on public.block_rules
    for each row execute function public.fn_touch_updated_at();

-- ---------------------------------------------------------------------------
-- rewards: grants + ledger
-- ---------------------------------------------------------------------------
create table public.unlock_grants (
    id               uuid primary key default gen_random_uuid(),
    user_id          uuid not null references public.profiles (id) on delete cascade,
    daily_plan_id    uuid not null references public.daily_plans (id) on delete cascade,
    device_id        uuid references public.devices (id) on delete set null,
    granted_minutes  integer not null check (granted_minutes > 0 and granted_minutes <= 1440),
    consumed_minutes integer not null default 0 check (consumed_minutes >= 0),
    remaining_minutes integer generated always as (granted_minutes - consumed_minutes) stored,
    status           public.grant_status not null default 'active',
    source           public.unlock_source not null default 'daily_plan_base',
    idempotency_key  text not null check (char_length(idempotency_key) between 8 and 200),
    valid_from       timestamptz not null default now(),
    expires_at       timestamptz not null,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now(),
    constraint unlock_grants_idempotent unique (user_id, idempotency_key),
    constraint unlock_grants_consumption check (consumed_minutes <= granted_minutes),
    constraint unlock_grants_window check (expires_at > valid_from)
);

-- One base grant per plan, enforced by the database, not by application code.
create unique index ux_unlock_grants_base_per_plan
    on public.unlock_grants (daily_plan_id)
    where source = 'daily_plan_base';

create index ix_unlock_grants_user_status on public.unlock_grants (user_id, status);
create index ix_unlock_grants_active_expiry on public.unlock_grants (expires_at) where status = 'active';

create trigger trg_unlock_grants_touch before update on public.unlock_grants
    for each row execute function public.fn_touch_updated_at();

create table public.reward_ledger (
    id             uuid primary key default gen_random_uuid(),
    user_id        uuid not null references public.profiles (id) on delete cascade,
    grant_id       uuid references public.unlock_grants (id) on delete cascade,
    delta_minutes  integer not null check (delta_minutes <> 0),
    reason         public.ledger_reason not null,
    reference_id   uuid,
    note           text check (note is null or char_length(note) <= 500),
    idempotency_key text not null check (char_length(idempotency_key) between 8 and 200),
    created_at     timestamptz not null default now(),
    constraint reward_ledger_idempotent unique (user_id, idempotency_key)
);

create index ix_reward_ledger_user_created on public.reward_ledger (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- usage events + device sync state
-- ---------------------------------------------------------------------------
create table public.usage_events (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid not null references public.profiles (id) on delete cascade,
    device_id       uuid not null,
    grant_id        uuid references public.unlock_grants (id) on delete set null,
    block_rule_id   uuid references public.block_rules (id) on delete set null,
    client_event_id text not null check (char_length(client_event_id) between 8 and 100),
    identifier      text not null check (char_length(identifier) between 1 and 256),
    display_name    text check (display_name is null or char_length(display_name) <= 200),
    started_at      timestamptz not null,
    ended_at        timestamptz,
    duration_seconds integer not null default 0 check (duration_seconds >= 0),
    was_blocked     boolean not null default false,
    created_at      timestamptz not null default now(),
    constraint usage_events_client_unique unique (device_id, client_event_id),
    constraint usage_events_device_owner
        foreign key (device_id, user_id) references public.devices (id, user_id) on delete cascade
);

create index ix_usage_events_user_started on public.usage_events (user_id, started_at desc);
create index ix_usage_events_device_started on public.usage_events (device_id, started_at desc);

create table public.device_sync_states (
    device_id          uuid primary key references public.devices (id) on delete cascade,
    user_id            uuid not null references public.profiles (id) on delete cascade,
    last_pulled_at     timestamptz,
    last_pushed_at     timestamptz,
    last_policy_version integer not null default 0 check (last_policy_version >= 0),
    pending_changes    integer not null default 0 check (pending_changes >= 0),
    cursor             text check (cursor is null or char_length(cursor) <= 256),
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now()
);

create trigger trg_device_sync_states_touch before update on public.device_sync_states
    for each row execute function public.fn_touch_updated_at();

-- ---------------------------------------------------------------------------
-- Views (security_invoker so RLS of the underlying tables still applies)
-- ---------------------------------------------------------------------------
create view public.v_plan_progress
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
        select sum(fs.actual_minutes)
        from public.focus_sessions fs
        join public.daily_plan_tasks pt2 on pt2.task_id = fs.task_id and pt2.plan_id = dp.id
        where fs.daily_plan_id = dp.id and fs.is_valid and pt2.kind = 'must_do'
    ), 0)::integer                                                                    as must_do_focus_done,
    count(pt.id) filter (where pt.kind = 'bonus' and pt.completed_at is not null)     as bonus_completed
from public.daily_plans dp
left join public.daily_plan_tasks pt on pt.plan_id = dp.id
group by dp.id, dp.user_id, dp.plan_date, dp.status;

create view public.v_reward_wallet
with (security_invoker = true) as
select
    p.id as user_id,
    coalesce(sum(g.granted_minutes), 0)::integer  as earned_minutes,
    coalesce(sum(g.consumed_minutes), 0)::integer as consumed_minutes,
    coalesce(sum(g.remaining_minutes) filter (
        where g.status = 'active' and g.expires_at > now()
    ), 0)::integer                                as remaining_minutes
from public.profiles p
left join public.unlock_grants g on g.user_id = p.id
group by p.id;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.user_settings       enable row level security;
alter table public.devices             enable row level security;
alter table public.tasks               enable row level security;
alter table public.daily_plans         enable row level security;
alter table public.daily_plan_tasks    enable row level security;
alter table public.daily_plan_events   enable row level security;
alter table public.focus_sessions      enable row level security;
alter table public.block_rules         enable row level security;
alter table public.unlock_grants       enable row level security;
alter table public.reward_ledger       enable row level security;
alter table public.usage_events        enable row level security;
alter table public.device_sync_states  enable row level security;

create policy profiles_select on public.profiles
    for select to authenticated using (id = auth.uid());
create policy profiles_insert on public.profiles
    for insert to authenticated with check (id = auth.uid());
create policy profiles_update on public.profiles
    for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy user_settings_select on public.user_settings
    for select to authenticated using (user_id = auth.uid());
create policy user_settings_update on public.user_settings
    for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy devices_select on public.devices
    for select to authenticated using (user_id = auth.uid());
create policy devices_insert on public.devices
    for insert to authenticated with check (user_id = auth.uid());
create policy devices_update on public.devices
    for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy devices_delete on public.devices
    for delete to authenticated using (user_id = auth.uid());

create policy tasks_select on public.tasks
    for select to authenticated using (user_id = auth.uid());
create policy tasks_insert on public.tasks
    for insert to authenticated with check (user_id = auth.uid());
create policy tasks_update on public.tasks
    for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy tasks_delete on public.tasks
    for delete to authenticated using (user_id = auth.uid());

create policy daily_plans_select on public.daily_plans
    for select to authenticated using (user_id = auth.uid());
create policy daily_plans_insert on public.daily_plans
    for insert to authenticated with check (user_id = auth.uid() and status = 'draft');
create policy daily_plans_update on public.daily_plans
    for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy daily_plans_delete on public.daily_plans
    for delete to authenticated using (user_id = auth.uid() and status = 'draft');

create policy daily_plan_tasks_select on public.daily_plan_tasks
    for select to authenticated using (user_id = auth.uid());
create policy daily_plan_tasks_insert on public.daily_plan_tasks
    for insert to authenticated
    with check (
        user_id = auth.uid()
        and exists (
            select 1 from public.daily_plans p
            where p.id = plan_id and p.user_id = auth.uid() and p.status = 'draft'
        )
    );
create policy daily_plan_tasks_update on public.daily_plan_tasks
    for update to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());
create policy daily_plan_tasks_delete on public.daily_plan_tasks
    for delete to authenticated
    using (
        user_id = auth.uid()
        and exists (
            select 1 from public.daily_plans p
            where p.id = plan_id and p.user_id = auth.uid() and p.status = 'draft'
        )
    );

create policy daily_plan_events_select on public.daily_plan_events
    for select to authenticated using (user_id = auth.uid());
create policy daily_plan_events_insert on public.daily_plan_events
    for insert to authenticated
    with check (
        user_id = auth.uid()
        and exists (
            select 1 from public.daily_plans p
            where p.id = plan_id and p.user_id = auth.uid()
        )
    );

create policy focus_sessions_select on public.focus_sessions
    for select to authenticated using (user_id = auth.uid());
create policy focus_sessions_insert on public.focus_sessions
    for insert to authenticated with check (user_id = auth.uid());
create policy focus_sessions_update on public.focus_sessions
    for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy focus_sessions_delete on public.focus_sessions
    for delete to authenticated using (user_id = auth.uid());

create policy block_rules_select on public.block_rules
    for select to authenticated using (user_id = auth.uid());
create policy block_rules_insert on public.block_rules
    for insert to authenticated with check (user_id = auth.uid());
create policy block_rules_update on public.block_rules
    for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy block_rules_delete on public.block_rules
    for delete to authenticated using (user_id = auth.uid());

-- Grants and the ledger are read-only for clients. They are written only by
-- the SECURITY DEFINER RPCs in 0002, which re-validate every condition.
create policy unlock_grants_select on public.unlock_grants
    for select to authenticated using (user_id = auth.uid());
create policy reward_ledger_select on public.reward_ledger
    for select to authenticated using (user_id = auth.uid());

create policy usage_events_select on public.usage_events
    for select to authenticated using (user_id = auth.uid());
create policy usage_events_insert on public.usage_events
    for insert to authenticated with check (user_id = auth.uid());

create policy device_sync_states_select on public.device_sync_states
    for select to authenticated using (user_id = auth.uid());
create policy device_sync_states_insert on public.device_sync_states
    for insert to authenticated with check (user_id = auth.uid());
create policy device_sync_states_update on public.device_sync_states
    for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Table privileges
-- ---------------------------------------------------------------------------
grant usage on schema public to authenticated;

grant select, insert, update, delete on
    public.profiles,
    public.devices,
    public.tasks,
    public.daily_plans,
    public.daily_plan_tasks,
    public.daily_plan_events,
    public.focus_sessions,
    public.block_rules,
    public.usage_events
to authenticated;

grant select, update on public.user_settings to authenticated;
grant select, insert, update on public.device_sync_states to authenticated;

grant select on public.unlock_grants, public.reward_ledger to authenticated;

-- Defence in depth: even if a policy were added by mistake, clients cannot
-- write reward state directly.
revoke insert, update, delete on public.unlock_grants from authenticated;
revoke insert, update, delete on public.reward_ledger from authenticated;

grant select on public.v_plan_progress, public.v_reward_wallet to authenticated;

-- Reward tables may only be written inside a validated RPC transaction. The
-- RPCs set the transaction-local `focusgate.rpc` flag after re-checking every
-- condition; any other write path (including a future policy mistake) raises.
create or replace function public.fn_reward_write_guard()
returns trigger
language plpgsql
as $$
begin
    if coalesce(current_setting('focusgate.rpc', true), '') <> 'on' then
        raise exception 'Reward state is written by the FocusGate backend only.'
            using errcode = '42501';
    end if;
    if tg_op = 'DELETE' then
        return old;
    end if;
    return new;
end;
$$;

create trigger trg_unlock_grants_no_direct_write
    before insert or update or delete on public.unlock_grants
    for each row execute function public.fn_reward_write_guard();
create trigger trg_reward_ledger_no_direct_write
    before insert or update or delete on public.reward_ledger
    for each row execute function public.fn_reward_write_guard();

commit;
