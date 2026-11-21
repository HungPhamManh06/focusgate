-- =============================================================================
-- FocusGate – development seed (idempotent)
-- Run with: supabase db reset   (applies migrations, then this file)
--
-- Demo credentials (local only): alice@focusgate.local / focusgate-dev
--                                bob@focusgate.local   / focusgate-dev
-- Never reuse these in a hosted project.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

do $$
declare
    alice uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    bob   uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    alice_device uuid := 'a1111111-1111-4111-8111-111111111111';
    alice_task uuid := 'a2222222-2222-4222-8222-222222222222';
    alice_bonus uuid := 'a3333333-3333-4333-8333-333333333333';
    alice_plan uuid;
begin
    if not exists (select 1 from auth.users where id = alice) then
        insert into auth.users
            (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
             raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
        values
            ('00000000-0000-0000-0000-000000000000', alice, 'authenticated', 'authenticated',
             'alice@focusgate.local', extensions.crypt('focusgate-dev', extensions.gen_salt('bf')),
             now(), '{"provider":"email","providers":["email"]}',
             '{"display_name":"Alice"}', now(), now());
    end if;

    if not exists (select 1 from auth.users where id = bob) then
        insert into auth.users
            (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
             raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
        values
            ('00000000-0000-0000-0000-000000000000', bob, 'authenticated', 'authenticated',
             'bob@focusgate.local', extensions.crypt('focusgate-dev', extensions.gen_salt('bf')),
             now(), '{"provider":"email","providers":["email"]}',
             '{"display_name":"Bob"}', now(), now());
    end if;

    insert into public.devices (id, user_id, name, platform, app_version, last_seen_at)
    values (alice_device, alice, 'Alice – Windows PC', 'windows', '0.1.0-poc', now())
    on conflict (id) do nothing;

    insert into public.tasks
        (id, user_id, title, description, category, kind, priority,
         estimated_minutes, required_focus_minutes, due_date, status)
    values
        (alice_task, alice, 'Write the FocusGate PRD',
         'Turn the product brief into an actionable PRD.',
         'work', 'must_do', 'high', 60, 50, now() + interval '6 hours', 'todo'),
        (alice_bonus, alice, 'Read one chapter',
         'Optional reading; earns a small bonus.',
         'study', 'bonus', 'low', 25, 20, now() + interval '1 day', 'todo')
    on conflict (id) do nothing;

    insert into public.daily_plans (id, user_id, plan_date, status)
    values ('a4444444-4444-4444-8444-444444444444', alice, current_date, 'draft')
    on conflict (user_id, plan_date) do nothing
    returning id into alice_plan;

    if alice_plan is not null then
        insert into public.daily_plan_tasks
            (plan_id, task_id, user_id, kind, required_focus_minutes, planned_minutes)
        values
            (alice_plan, alice_task, alice, 'must_do', 50, 60),
            (alice_plan, alice_bonus, alice, 'bonus', 20, 25)
        on conflict (plan_id, task_id) do nothing;
    end if;

    insert into public.block_rules
        (user_id, device_id, platform, rule_type, identifier, display_name, category, action)
    values
        (alice, alice_device, 'windows', 'block', 'Discord', 'Discord', 'social', 'overlay'),
        (alice, alice_device, 'windows', 'block', 'Steam', 'Steam', 'games', 'overlay'),
        (alice, alice_device, 'windows', 'allow', 'explorer', 'Windows Explorer', 'other', 'notify')
    on conflict (device_id, identifier) do nothing;

    raise notice 'FocusGate seed complete for % and %', alice, bob;
end;
$$;
