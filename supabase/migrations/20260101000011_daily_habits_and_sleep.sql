-- Add daily habit flag on tasks, bedtime window on user_settings,
-- and an RPC to populate today's plan from daily habits or the previous plan.

begin;

alter table public.tasks
    add column if not exists is_daily_habit boolean not null default false;

alter table public.user_settings
    add column if not exists bedtime_start text default null,
    add column if not exists bedtime_end text default null;

create or replace function public.rpc_populate_today_habits(p_plan_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_uid uuid := auth.uid();
    v_plan public.daily_plans%rowtype;
    v_added integer := 0;
    v_prev_plan_id uuid;
    v_task record;
begin
    if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;

    select * into v_plan from public.daily_plans
    where id = p_plan_id and user_id = v_uid
    for update;
    if not found then raise exception 'forbidden: unknown plan' using errcode = '42501'; end if;

    if v_plan.status <> 'draft' then
        raise exception 'plan_locked: habits can only be loaded while the plan is draft'
            using errcode = '55000';
    end if;

    perform set_config('focusgate.rpc', 'on', true);

    -- First try tasks explicitly marked as daily habits.
    for v_task in
        select t.id, t.kind, t.required_focus_minutes
        from public.tasks t
        where t.user_id = v_uid
          and t.is_daily_habit = true
          and not exists (
              select 1 from public.daily_plan_tasks pt
              where pt.plan_id = p_plan_id and pt.task_id = t.id
          )
        order by t.created_at asc
    loop
        update public.tasks
        set status = 'todo', completed_at = null
        where id = v_task.id and user_id = v_uid and status = 'completed';

        insert into public.daily_plan_tasks (plan_id, user_id, task_id, kind, required_focus_minutes)
        values (p_plan_id, v_uid, v_task.id, v_task.kind, v_task.required_focus_minutes)
        on conflict (plan_id, task_id) do nothing;
        v_added := v_added + 1;
    end loop;

    -- If no daily habits are flagged yet, copy tasks from the most recent previous plan.
    if v_added = 0 then
        select id into v_prev_plan_id
        from public.daily_plans
        where user_id = v_uid and id <> p_plan_id and plan_date < v_plan.plan_date
        order by plan_date desc
        limit 1;

        if v_prev_plan_id is not null then
            for v_task in
                select pt.task_id, pt.kind, pt.required_focus_minutes
                from public.daily_plan_tasks pt
                where pt.plan_id = v_prev_plan_id and pt.user_id = v_uid
                  and not exists (
                      select 1 from public.daily_plan_tasks cur
                      where cur.plan_id = p_plan_id and cur.task_id = pt.task_id
                  )
                order by pt.sort_order asc, pt.created_at asc
            loop
                update public.tasks
                set status = 'todo', completed_at = null
                where id = v_task.task_id and user_id = v_uid and status = 'completed';

                insert into public.daily_plan_tasks (plan_id, user_id, task_id, kind, required_focus_minutes)
                values (p_plan_id, v_uid, v_task.task_id, v_task.kind, v_task.required_focus_minutes)
                on conflict (plan_id, task_id) do nothing;
                v_added := v_added + 1;
            end loop;
        end if;
    end if;

    return jsonb_build_object('added', v_added);
end;
$$;

revoke all on function public.rpc_populate_today_habits(uuid) from public, anon;
grant execute on function public.rpc_populate_today_habits(uuid) to authenticated;

commit;
