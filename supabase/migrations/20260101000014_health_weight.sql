-- Add weight_kg to daily_health_metrics for manual & device health tracking

begin;

alter table public.daily_health_metrics
    add column if not exists weight_kg numeric(5, 2) default null;

commit;
