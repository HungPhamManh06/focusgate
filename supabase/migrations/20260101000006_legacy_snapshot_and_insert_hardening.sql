-- =============================================================================
-- FocusGate – 0006 legacy snapshot preservation & insert default hardening
--
-- Milestone A1.1.1 hotfix for environments that already applied 0005:
--   1. Drops `DEFAULT 1` on `public.focus_sessions.min_valid_minutes` so that
--      any direct INSERT omitting `min_valid_minutes` passes NULL into the
--      BEFORE INSERT trigger `fn_validate_focus_session()`, which snapshots the
--      user's current `user_settings.min_valid_focus_minutes` before NOT NULL
--      and CHECK (`min_valid_minutes between 1 and 120`) constraints run.
--   2. Re-backfills any active (`running`/`paused`) sessions that had their
--      `min_valid_minutes` clamped down to `planned_minutes * 2` by the initial
--      0005 backfill, restoring the user's actual `min_valid_focus_minutes`
--      threshold without clamping to `planned_minutes * 2`.
--   3. Preserves all historical completed/cancelled session `is_valid`,
--      `actual_minutes`, and `credited_minutes` values untouched.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Drop DEFAULT 1 on focus_sessions.min_valid_minutes while keeping
--    NOT NULL and CHECK (min_valid_minutes between 1 and 120)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 2. Re-backfill legacy active (running/paused) sessions whose threshold was
--    clamped to `planned_minutes * 2` or defaulted to 1, ONLY when
--    `user_settings.updated_at <= focus_sessions.started_at` (meaning the
--    setting was not changed after the session started).
-- ---------------------------------------------------------------------------
alter table public.focus_sessions disable trigger user;

update public.focus_sessions fs
set min_valid_minutes = greatest(
    1,
    least(120, coalesce(s.min_valid_focus_minutes, 1))
)
from public.user_settings s
where s.user_id = fs.user_id
  and fs.status in ('running', 'paused')
  and s.updated_at <= fs.started_at
  and (
      fs.min_valid_minutes = fs.planned_minutes * 2
      or fs.min_valid_minutes = 1
  )
  and fs.min_valid_minutes < coalesce(s.min_valid_focus_minutes, 1);

alter table public.focus_sessions enable trigger user;

-- ---------------------------------------------------------------------------
-- 3. Ensure fn_validate_focus_session snapshots user_settings when omitted
--    on INSERT and enforces immutability on UPDATE
-- ---------------------------------------------------------------------------
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

        -- Clamp claimed actual_minutes to wall-clock elapsed time (0..600).
        if new.actual_minutes is null or new.actual_minutes < 0 then
            new.actual_minutes := 0;
        end if;
        if new.actual_minutes > v_elapsed_minutes + 1 then
            new.actual_minutes := least(v_elapsed_minutes, 600);
        end if;
        new.actual_minutes := least(greatest(new.actual_minutes, 0), 600);

        -- Validate against the session's snapshotted min_valid_minutes AND ensure
        -- that even for a legacy row where planned_minutes * 2 < min_valid_minutes,
        -- a session cannot be marked valid if its maximum possible credit (2x planned)
        -- is below the minimum threshold.
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
