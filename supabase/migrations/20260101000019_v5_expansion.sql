-- FocusGate v5 Expansion:
-- 1. ICS Calendar sync, Telegram/Discord bot briefing, Evolving Gate Theme, Onboarding flag on user_settings
-- 2. Focus Quests table (7-day / 21-day challenges)

begin;

alter table public.user_settings
    add column if not exists calendar_ics_url text default null,
    add column if not exists calendar_auto_lock boolean not null default false,
    add column if not exists telegram_chat_id text default null,
    add column if not exists telegram_link_token text default null,
    add column if not exists discord_webhook_url text default null,
    add column if not exists gate_theme text not null default 'stone',
    add column if not exists onboarding_completed boolean not null default false;

create table if not exists public.focus_quests (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    quest_key text not null,
    title text not null,
    target_value integer not null default 7 check (target_value > 0),
    current_value integer not null default 0 check (current_value >= 0),
    unit text not null default 'days',
    status text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
    started_at timestamptz not null default now(),
    completed_at timestamptz default null,
    updated_at timestamptz not null default now()
);

alter table public.focus_quests enable row level security;

drop policy if exists focus_quests_owner_all on public.focus_quests;
create policy focus_quests_owner_all
    on public.focus_quests
    for all
    to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

create or replace function public.rpc_update_v5_settings(
    p_calendar_ics_url text default null,
    p_clear_calendar_ics_url boolean default false,
    p_calendar_auto_lock boolean default null,
    p_telegram_chat_id text default null,
    p_discord_webhook_url text default null,
    p_clear_discord_webhook boolean default false,
    p_gate_theme text default null,
    p_onboarding_completed boolean default null
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
    set calendar_ics_url = case
            when p_clear_calendar_ics_url then null
            when p_calendar_ics_url is not null then nullif(left(trim(p_calendar_ics_url), 1000), '')
            else calendar_ics_url
        end,
        calendar_auto_lock = coalesce(p_calendar_auto_lock, calendar_auto_lock),
        telegram_chat_id = case
            when p_telegram_chat_id is not null then nullif(left(trim(p_telegram_chat_id), 64), '')
            else telegram_chat_id
        end,
        discord_webhook_url = case
            when p_clear_discord_webhook then null
            when p_discord_webhook_url is not null then nullif(left(trim(p_discord_webhook_url), 500), '')
            else discord_webhook_url
        end,
        gate_theme = case
            when p_gate_theme in ('stone', 'bronze', 'obsidian', 'emerald', 'gold') then p_gate_theme
            else gate_theme
        end,
        onboarding_completed = coalesce(p_onboarding_completed, onboarding_completed),
        updated_at = now()
    where user_id = v_uid;

    return jsonb_build_object('updated', true);
end;
$$;

revoke all on function public.rpc_update_v5_settings(text, boolean, boolean, text, text, boolean, text, boolean) from public, anon;
grant execute on function public.rpc_update_v5_settings(text, boolean, boolean, text, text, boolean, text, boolean) to authenticated;

commit;
