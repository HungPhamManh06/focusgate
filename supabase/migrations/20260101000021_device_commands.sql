-- FocusGate AI Omni-Controller: Cross-Device Remote Command Queue (TTL 5 minutes)
create table if not exists public.device_commands (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  target_platform text not null check (target_platform in ('windows', 'android', 'any')),
  command_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'executed', 'failed', 'expired')),
  result_message text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  executed_at timestamptz
);

create index if not exists idx_device_commands_poll
  on public.device_commands (user_id, target_platform, status, created_at desc);

alter table public.device_commands enable row level security;

drop policy if exists "Users can manage own device commands" on public.device_commands;
create policy "Users can manage own device commands"
  on public.device_commands
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
