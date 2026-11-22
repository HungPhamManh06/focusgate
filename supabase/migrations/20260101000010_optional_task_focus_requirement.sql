-- Default task focus requirement to 0 (optional) and provide a direct
-- completion RPC so small tasks do not require a 25-minute focus block.

begin;

alter table public.tasks
    alter column required_focus_minutes set default 0;

alter table public.daily_plan_tasks
    alter column required_focus_minutes set default 0;

create or replace function public.rpc_complete_plan_task_direct(p_plan_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_uid uuid := auth.uid();
    v_pt public.daily_plan_tasks%rowtype;
    v_plan_status public.plan_status;
begin
    if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;

    select * into v_pt from public.daily_plan_tasks
    where id = p_plan_task_id and user_id = v_uid
    for update;
    if not found then raise exception 'forbidden' using errcode = '42501'; end if;

    select status into v_plan_status from public.daily_plans
    where id = v_pt.plan_id and user_id = v_uid;

    if v_plan_status <> 'active' then
        raise exception 'plan_not_active: tasks can be completed only while the plan is active'
            using errcode = '55000';
    end if;
    if v_pt.completed_at is not null then
        return jsonb_build_object('completed', true, 'alreadyCompleted', true);
    end if;

    perform set_config('focusgate.rpc', 'on', true);
    update public.tasks
    set status = 'completed',
        required_focus_minutes = 0
    where id = v_pt.task_id and user_id = v_uid;

    update public.daily_plan_tasks
    set completed_at = now(),
        required_focus_minutes = 0
    where id = v_pt.id;

    insert into public.daily_plan_events (plan_id, user_id, event_type, payload)
    values (v_pt.plan_id, v_uid, 'task_completed',
            jsonb_build_object('planTaskId', v_pt.id, 'direct', true));

    return jsonb_build_object('completed', true, 'alreadyCompleted', false);
end;
$$;

revoke all on function public.rpc_complete_plan_task_direct(uuid) from public, anon;
grant execute on function public.rpc_complete_plan_task_direct(uuid) to authenticated;

commit;
