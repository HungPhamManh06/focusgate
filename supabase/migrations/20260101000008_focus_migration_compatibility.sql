-- =============================================================================
-- FocusGate – 0008 focus migration compatibility & trigger synchronization
--
-- Milestone A1.1.2.2:
--   Ensures that databases upgrading from 0005 via the safe 0006-bypass path
--   (both local PGlite and hosted Supabase `migration repair --status applied`)
--   receive the exact same final `focus_sessions.min_valid_minutes` constraints
--   and `fn_validate_focus_session()` trigger function as databases that ran
--   0001..0007 sequentially.
--
--   This migration is strictly idempotent and performs NO row backfills,
--   preserving all active session snapshots and historical session credits.
-- =============================================================================

begin;

-- 1. Idempotently ensure `min_valid_minutes` has no default, is NOT NULL, and
--    enforces `between 1 and 120`.
alter table public.focus_sessions
    alter column min_valid_minutes drop default,
    alter column min_valid_minutes set not null;

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'focus_sessions_min_valid_minutes_check'
          and conrelid = 'public.focus_sessions'::regclass
    ) then
        alter table public.focus_sessions
            add constraint focus_sessions_min_valid_minutes_check
            check (min_valid_minutes between 1 and 120);
    end if;
end $$;

-- 2. Idempotently synchronize `public.fn_validate_focus_session()` to the final
--    hardened snapshot & credit-cap validation logic.
create or replace function public.fn_validate_focus_session()
returns trigger
language plpgsql
as $$
declare
    v_user_min_valid integer := 1;
    v_min_valid integer := 1;
    v_elapsed_minutes integer;
begin
    if tg_op = 'INSERT' then
        select s.min_valid_focus_minutes into v_user_min_valid
        from public.user_settings s
        where s.user_id = new.user_id;

        if new.min_valid_minutes is null or new.min_valid_minutes < 1 then
            new.min_valid_minutes := least(120, greatest(coalesce(v_user_min_valid, 1), 1));
        else
            new.min_valid_minutes := least(120, greatest(new.min_valid_minutes, 1));
        end if;
    else
        new.min_valid_minutes := coalesce(old.min_valid_minutes, new.min_valid_minutes, 1);
    end if;

    v_min_valid := greatest(coalesce(new.min_valid_minutes, 1), 1);
    new.is_valid := false;
    new.credited_minutes := 0;

    if new.planned_minutes is null or new.planned_minutes not between 1 and 600 then
        raise exception 'invalid_input: planned minutes must be between 1 and 600'
            using errcode = '22023';
    end if;

    if new.ended_at is not null and new.ended_at < new.started_at then
        raise exception 'focus session ends before it starts' using errcode = '22007';
    end if;

    if new.status = 'completed' and new.ended_at is not null then
        v_elapsed_minutes := greatest(
            0,
            floor(extract(epoch from (new.ended_at - new.started_at)) / 60)::integer
        );

        if new.actual_minutes is null or new.actual_minutes < 0 then
            new.actual_minutes := 0;
        end if;
        if new.actual_minutes > v_elapsed_minutes + 1 then
            new.actual_minutes := least(v_elapsed_minutes, 600);
        end if;
        new.actual_minutes := least(greatest(new.actual_minutes, 0), 600);

        new.is_valid := new.actual_minutes >= v_min_valid
            and (new.planned_minutes * 2) >= v_min_valid
            and new.actual_minutes > 0;

        if new.is_valid then
            new.credited_minutes := least(new.actual_minutes, new.planned_minutes * 2);
        else
            new.credited_minutes := 0;
        end if;
    elsif new.status = 'cancelled' then
        new.actual_minutes := 0;
        new.is_valid := false;
        new.credited_minutes := 0;
    end if;

    return new;
end;
$$;

commit;
