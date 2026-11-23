-- Daily health metrics synced from Mi Band / Android Health Connect

begin;

create table if not exists public.daily_health_metrics (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    device_id uuid references public.devices(id) on delete set null,
    metric_date date not null,
    steps integer not null default 0,
    sleep_minutes integer not null default 0,
    avg_heart_rate integer default null,
    active_calories integer not null default 0,
    source text not null default 'health_connect',
    synced_at timestamptz not null default now(),
    unique (user_id, metric_date)
);

alter table public.daily_health_metrics enable row level security;

drop policy if exists daily_health_metrics_owner_all on public.daily_health_metrics;
create policy daily_health_metrics_owner_all
    on public.daily_health_metrics
    for all
    to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

commit;
