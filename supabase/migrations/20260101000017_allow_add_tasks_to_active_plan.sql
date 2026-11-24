-- Allow adding unplanned tasks from backlog into confirmed/active daily plans,
-- while continuing to forbid adding tasks to completed/skipped plans and
-- continuing to prevent silent deletion or un-audited downgrading of committed Must-Dos.

begin;

create or replace function public.rpc_add_plan_task(
    p_plan_id uuid,
    p_task_id uuid,
    p_kind public.task_kind default null,
    p_planned_start timestamptz default null,
    p_planned_minutes integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_uid uuid := auth.uid();
    v_plan public.daily_plans%rowtype;
    v_task public.tasks%rowtype;
    v_kind public.task_kind;
    v_order integer;
    v_id uuid;
begin
    if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;

    select * into v_plan from public.daily_plans
    where id = p_plan_id and user_id = v_uid
    for update;
    if not found then raise exception 'plan_not_found' using errcode = 'P0002'; end if;
    if v_plan.status not in ('draft', 'confirmed', 'active') then
        raise exception 'plan_not_active: tasks cannot be added to a % plan', v_plan.status
            using errcode = '55000';
    end if;

    select * into v_task from public.tasks where id = p_task_id and user_id = v_uid;
    if not found then
        raise exception 'forbidden: task does not belong to the user' using errcode = '42501';
    end if;
    if v_task.status in ('completed', 'cancelled') then
        raise exception 'invalid_input: a % task cannot be planned', v_task.status
            using errcode = '22023';
    end if;

    v_kind := coalesce(p_kind, v_task.kind);
    perform set_config('focusgate.rpc', 'on', true);

    select coalesce(max(sort_order), 0) + 1 into v_order
    from public.daily_plan_tasks where plan_id = p_plan_id;

    insert into public.daily_plan_tasks
        (plan_id, task_id, user_id, kind, required_focus_minutes, planned_start, planned_minutes, sort_order)
    values
        (p_plan_id, p_task_id, v_uid, v_kind, v_task.required_focus_minutes, p_planned_start,
         coalesce(p_planned_minutes, greatest(v_task.estimated_minutes, 1)), v_order)
    on conflict (plan_id, task_id) do nothing
    returning id into v_id;

    if v_id is null then
        select id into v_id from public.daily_plan_tasks
        where plan_id = p_plan_id and task_id = p_task_id;
        return jsonb_build_object('planTaskId', v_id, 'created', false);
    end if;

    insert into public.daily_plan_events (plan_id, user_id, event_type, payload)
    values (p_plan_id, v_uid, 'task_added',
            jsonb_build_object('taskId', p_task_id, 'kind', v_kind, 'planStatus', v_plan.status));

    return jsonb_build_object('planTaskId', v_id, 'created', true);
end;
$$;

revoke all on function public.rpc_add_plan_task(uuid, uuid, public.task_kind, timestamptz, integer) from public, anon;
grant execute on function public.rpc_add_plan_task(uuid, uuid, public.task_kind, timestamptz, integer) to authenticated;

commit;
