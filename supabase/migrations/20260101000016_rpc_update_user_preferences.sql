-- Allow authenticated users to update their own preference and goal columns
-- on user_settings without granting direct UPDATE on reward/balance columns.

begin;

create or replace function public.rpc_update_user_preferences(
    p_language text default null,
    p_daily_focus_goal_minutes integer default null,
    p_daily_steps_goal integer default null,
    p_daily_sleep_goal_hours numeric default null,
    p_target_weight_kg numeric default null,
    p_clear_target_weight boolean default false,
    p_whitelist_focus_mode boolean default null,
    p_allowed_apps text[] default null,
    p_allowed_domains text[] default null,
    p_blocked_domains text[] default null,
    p_weekday_bedtime_start text default null,
    p_weekday_bedtime_end text default null,
    p_weekend_bedtime_start text default null,
    p_weekend_bedtime_end text default null,
    p_weekend_relaxed_mode boolean default null,
    p_last_daily_review_date text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_uid uuid := auth.uid();
begin
    if v_uid is null then
        raise exception 'not_authenticated' using errcode = '42501';
    end if;

    perform set_config('focusgate.rpc', 'on', true);

    insert into public.user_settings (user_id)
    values (v_uid)
    on conflict (user_id) do nothing;

    update public.user_settings
    set
        language = case
            when p_language in ('en', 'vi') then p_language
            else language
        end,
        daily_focus_goal_minutes = case
            when p_daily_focus_goal_minutes is not null then greatest(15, p_daily_focus_goal_minutes)
            else daily_focus_goal_minutes
        end,
        daily_steps_goal = case
            when p_daily_steps_goal is not null then greatest(1000, p_daily_steps_goal)
            else daily_steps_goal
        end,
        daily_sleep_goal_hours = case
            when p_daily_sleep_goal_hours is not null then least(14.0, greatest(4.0, round(p_daily_sleep_goal_hours::numeric, 1)))
            else daily_sleep_goal_hours
        end,
        target_weight_kg = case
            when p_clear_target_weight then null
            when p_target_weight_kg is not null and p_target_weight_kg > 0 then round(p_target_weight_kg::numeric, 2)
            else target_weight_kg
        end,
        whitelist_focus_mode = coalesce(p_whitelist_focus_mode, whitelist_focus_mode),
        allowed_apps = coalesce(p_allowed_apps, allowed_apps),
        allowed_domains = coalesce(p_allowed_domains, allowed_domains),
        blocked_domains = coalesce(p_blocked_domains, blocked_domains),
        weekday_bedtime_start = coalesce(p_weekday_bedtime_start, weekday_bedtime_start),
        weekday_bedtime_end = coalesce(p_weekday_bedtime_end, weekday_bedtime_end),
        weekend_bedtime_start = coalesce(p_weekend_bedtime_start, weekend_bedtime_start),
        weekend_bedtime_end = coalesce(p_weekend_bedtime_end, weekend_bedtime_end),
        weekend_relaxed_mode = coalesce(p_weekend_relaxed_mode, weekend_relaxed_mode),
        last_daily_review_date = coalesce(p_last_daily_review_date, last_daily_review_date),
        updated_at = now()
    where user_id = v_uid;

    return jsonb_build_object('updated', true);
end;
$$;

revoke all on function public.rpc_update_user_preferences(
    text, integer, integer, numeric, numeric, boolean, boolean, text[], text[], text[], text, text, text, text, boolean, text
) from public, anon;

grant execute on function public.rpc_update_user_preferences(
    text, integer, integer, numeric, numeric, boolean, boolean, text[], text[], text[], text, text, text, text, boolean, text
) to authenticated;

commit;
