-- Local workspace seed. Runs once on a fresh PGlite database.
-- All values are relative to the seed day so the dashboard has live context.

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------
update public.profiles
set display_name = 'Alex Morgan', timezone = 'Asia/Ho_Chi_Minh'
where id = '9f8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

insert into public.devices (id, user_id, name, platform, os_version, app_version, last_seen_at)
values (
    '3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a',
    '9f8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
    'Alex''s PC', 'windows', 'Windows 11', '0.1.0-local', now()
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Tasks: today's commitment + completed history for statistics
-- ---------------------------------------------------------------------------
insert into public.tasks
    (id, user_id, title, description, category, kind, priority,
     estimated_minutes, required_focus_minutes, due_date, status, completed_at, created_at)
values
    ('11111111-1111-4111-8111-111111111111',
     '9f8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
     'Ship the FocusGate landing page',
     'Final pass on copy, responsive checks and the deploy preview.',
     'work', 'must_do', 'urgent', 90, 75, now() + interval '3 hours', 'todo', null,
     now() - interval '2 days'),

    ('22222222-2222-4222-8222-222222222222',
     '9f8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
     'Write the weekly product brief',
     'Summarise learnings, decisions and next bets for the team.',
     'work', 'must_do', 'high', 45, 30, now() + interval '6 hours', 'todo', null,
     now() - interval '1 day'),

    ('33333333-3333-4333-8333-333333333333',
     '9f8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
     'Review the open pull requests',
     'Planner polish and focus-timer edge cases.',
     'work', 'should_do', 'medium', 30, 20, now() + interval '1 day', 'todo', null,
     now() - interval '1 day'),

    ('44444444-4444-4444-8444-444444444444',
     '9f8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
     'Read 20 pages of Deep Work',
     'Optional reading. Earns a small bonus toward unlock time.',
     'study', 'bonus', 'low', 30, 20, now() + interval '3 days', 'todo', null,
     now() - interval '3 days'),

    ('55555555-5555-4555-8555-555555555555',
     '9f8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
     'Draft the onboarding survey',
     'Questions for the first-run experience.',
     'work', 'must_do', 'high', 40, 30, now() - interval '2 days', 'completed',
     now() - interval '2 days' + interval '4 hours', now() - interval '4 days'),

    ('66666666-6666-4666-8666-666666666666',
     '9f8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
     'Fix planner drag state',
     'Reorder no longer loses selection after a re-render.',
     'work', 'should_do', 'medium', 35, 25, now() - interval '2 days', 'completed',
     now() - interval '2 days' + interval '6 hours', now() - interval '5 days'),

    ('77777777-7777-4777-8777-777777777777',
     '9f8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
     'Outline the reward ledger rules',
     'Idempotency and expiry edge cases.',
     'work', 'must_do', 'urgent', 50, 40, now() - interval '4 days', 'completed',
     now() - interval '4 days' + interval '5 hours', now() - interval '6 days'),

    ('88888888-8888-4888-8888-888888888888',
     '9f8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
     'Interview two FocusGate testers',
     'Notes on where the blocking flow felt confusing.',
     'work', 'should_do', 'medium', 45, 30, now() - interval '6 days', 'completed',
     now() - interval '6 days' + interval '3 hours', now() - interval '8 days')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Today's draft plan
-- ---------------------------------------------------------------------------
insert into public.daily_plans (id, user_id, plan_date, status, created_at)
values (
    'aaaaaaaa-1111-4111-8111-111111111111',
    '9f8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
    (now() at time zone 'Asia/Ho_Chi_Minh')::date,
    'draft', now() - interval '8 hours'
)
on conflict (user_id, plan_date) do nothing;

insert into public.daily_plan_tasks
    (id, plan_id, task_id, user_id, kind, required_focus_minutes, planned_minutes, sort_order, created_at)
values
    ('bbbbbbbb-1111-4111-8111-111111111111',
     'aaaaaaaa-1111-4111-8111-111111111111',
     '11111111-1111-4111-8111-111111111111',
     '9f8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
     'must_do', 75, 90, 1, now() - interval '8 hours'),
    ('bbbbbbbb-2222-4222-8222-222222222222',
     'aaaaaaaa-1111-4111-8111-111111111111',
     '22222222-2222-4222-8222-222222222222',
     '9f8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
     'must_do', 30, 45, 2, now() - interval '8 hours'),
    ('bbbbbbbb-3333-4333-8333-333333333333',
     'aaaaaaaa-1111-4111-8111-111111111111',
     '33333333-3333-4333-8333-333333333333',
     '9f8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
     'should_do', 20, 30, 3, now() - interval '8 hours'),
    ('bbbbbbbb-4444-4444-8444-444444444444',
     'aaaaaaaa-1111-4111-8111-111111111111',
     '44444444-4444-4444-8444-444444444444',
     '9f8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
     'bonus', 20, 30, 4, now() - interval '8 hours')
on conflict (plan_id, task_id) do nothing;

insert into public.daily_plan_events (plan_id, user_id, event_type, payload, created_at)
values
    ('aaaaaaaa-1111-4111-8111-111111111111', '9f8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
     'created', '{}'::jsonb, now() - interval '8 hours')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- A completed plan from two days ago (history + carried grant)
-- ---------------------------------------------------------------------------
insert into public.daily_plans
    (id, user_id, plan_date, status, confirmed_at, activated_at, completed_at, created_at)
values (
    'aaaaaaaa-2222-4222-8222-222222222222',
    '9f8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
    (now() at time zone 'Asia/Ho_Chi_Minh')::date - 2,
    'completed', now() - interval '2 days 6 hours', now() - interval '2 days 5 hours',
    now() - interval '2 days 1 hour', now() - interval '2 days 8 hours'
)
on conflict (id) do nothing;

-- Privileged seed inserts into a completed plan's task list require the same
-- explicit transaction flag used by the audited RPCs.
select set_config('focusgate.rpc', 'on', false);

insert into public.daily_plan_tasks
    (id, plan_id, task_id, user_id, kind, required_focus_minutes, planned_minutes, completed_at, created_at)
values
    ('bbbbbbbb-5555-4555-8555-555555555555',
     'aaaaaaaa-2222-4222-8222-222222222222',
     '55555555-5555-4555-8555-555555555555',
     '9f8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
     'must_do', 30, 40, now() - interval '2 days 2 hours', now() - interval '2 days 8 hours'),
    ('bbbbbbbb-6666-4666-8666-666666666666',
     'aaaaaaaa-2222-4222-8222-222222222222',
     '66666666-6666-4666-8666-666666666666',
     '9f8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
     'should_do', 25, 35, now() - interval '2 days 2 hours', now() - interval '2 days 8 hours')
on conflict (plan_id, task_id) do nothing;

-- ---------------------------------------------------------------------------
-- Focus sessions (server-valid because the trigger recomputes validity)
-- ---------------------------------------------------------------------------
insert into public.focus_sessions
    (id, user_id, task_id, daily_plan_id, device_id, client_id, mode,
     planned_minutes, actual_minutes, status, started_at, ended_at)
values
    ('cccccccc-1111-4111-8111-111111111111',
     '9f8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
     '11111111-1111-4111-8111-111111111111',
     'aaaaaaaa-1111-4111-8111-111111111111',
     '3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a',
     'seed-session-today-1', 'pomodoro_25_5', 25, 25, 'completed',
     now() - interval '3 hours', now() - interval '2 hours 35 minutes'),

    ('cccccccc-2222-4222-8222-222222222222',
     '9f8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
     '55555555-5555-4555-8555-555555555555',
     'aaaaaaaa-2222-4222-8222-222222222222',
     '3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a',
     'seed-session-past-1', 'pomodoro_25_5', 25, 25, 'completed',
     now() - interval '2 days 5 hours', now() - interval '2 days 4 hours 35 minutes'),

    ('cccccccc-3333-4333-8333-333333333333',
     '9f8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
     '66666666-6666-4666-8666-666666666666',
     'aaaaaaaa-2222-4222-8222-222222222222',
     '3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a',
     'seed-session-past-2', 'custom', 20, 20, 'completed',
     now() - interval '2 days 3 hours', now() - interval '2 days 2 hours 40 minutes'),

    ('cccccccc-4444-4444-8444-444444444444',
     '9f8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
     '77777777-7777-4777-8777-777777777777',
     null,
     '3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a',
     'seed-session-4d', 'pomodoro_50_10', 50, 48, 'completed',
     now() - interval '4 days 4 hours', now() - interval '4 days 3 hours 12 minutes'),

    ('cccccccc-5555-4555-8555-555555555555',
     '9f8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
     '88888888-8888-4888-8888-888888888888',
     null,
     '3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a',
     'seed-session-6d', 'pomodoro_25_5', 25, 25, 'completed',
     now() - interval '6 days 6 hours', now() - interval '6 days 5 hours 35 minutes'),

    ('cccccccc-6666-4666-8666-666666666666',
     '9f8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
     '77777777-7777-4777-8777-777777777777',
     null,
     '3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a',
     'seed-session-5d', 'custom', 40, 40, 'completed',
     now() - interval '5 days 7 hours', now() - interval '5 days 6 hours 20 minutes')
on conflict (device_id, client_id) do nothing;

-- ---------------------------------------------------------------------------
-- Carried unlock grant + ledger + usage history
-- ---------------------------------------------------------------------------
insert into public.unlock_grants
    (id, user_id, daily_plan_id, device_id, granted_minutes, consumed_minutes, status,
     source, idempotency_key, valid_from, expires_at)
values (
    'dddddddd-1111-4111-8111-111111111111',
    '9f8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
    'aaaaaaaa-2222-4222-8222-222222222222',
    '3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a',
    45, 10, 'active', 'daily_plan_base', 'seed-grant-0001',
    now() - interval '2 days',
    (((now() at time zone 'Asia/Ho_Chi_Minh')::date + 1) + time '04:00') at time zone 'Asia/Ho_Chi_Minh'
)
on conflict (user_id, idempotency_key) do nothing;

insert into public.reward_ledger
    (id, user_id, grant_id, delta_minutes, reason, reference_id, note, idempotency_key, created_at)
values
    ('eeeeeeee-1111-4111-8111-111111111111',
     '9f8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
     'dddddddd-1111-4111-8111-111111111111',
     45, 'grant', 'aaaaaaaa-2222-4222-8222-222222222222',
     'Daily plan reward', 'seed-ledger-0001', now() - interval '2 days'),
    ('eeeeeeee-2222-4222-8222-222222222222',
     '9f8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
     'dddddddd-1111-4111-8111-111111111111',
     -10, 'consume', null,
     'Discord', 'seed-ledger-0002', now() - interval '1 day 3 hours')
on conflict (user_id, idempotency_key) do nothing;

select set_config('focusgate.rpc', '', false);

insert into public.usage_events
    (id, user_id, device_id, grant_id, client_event_id, identifier, display_name,
     started_at, ended_at, duration_seconds, was_blocked)
values
    ('ffffffff-1111-4111-8111-111111111111',
     '9f8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
     '3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a',
     'dddddddd-1111-4111-8111-111111111111',
     'seed-usage-0001', 'Discord', 'Discord',
     now() - interval '1 day 3 hours', now() - interval '1 day 2 hours 20 minutes', 2400, false),
    ('ffffffff-2222-4222-8222-222222222222',
     '9f8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
     '3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a',
     null,
     'seed-usage-0002', 'Steam', 'Steam',
     now() - interval '3 days 5 hours', now() - interval '3 days 4 hours 35 minutes', 1500, true)
on conflict (device_id, client_event_id) do nothing;
