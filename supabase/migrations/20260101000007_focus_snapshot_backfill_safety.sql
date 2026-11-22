-- =============================================================================
-- FocusGate – 0007 focus snapshot backfill safety
--
-- Milestone A1.1.2 hotfix:
--   Protects legitimate session-level `min_valid_minutes` snapshots from being
--   overwritten when `user_settings.min_valid_focus_minutes` changes after a
--   session starts (`user_settings.updated_at > focus_sessions.started_at`).
--
--   Safe-repair rule:
--     - If `user_settings.updated_at <= focus_sessions.started_at`, the user's
--       setting has NOT changed after the session started. Any legacy active
--       (`running`/`paused`) session that was clamped to `planned_minutes * 2`
--       or defaulted to `1` by an earlier backfill can be safely repaired to
--       `user_settings.min_valid_focus_minutes` (without clamping to 2x planned).
--     - If `user_settings.updated_at > focus_sessions.started_at`, the evidence
--       is ambiguous (the setting changed mid-session), so the existing
--       snapshot is preserved untouched and a notice is logged.
--     - Historical completed/cancelled sessions (`is_valid`, `actual_minutes`,
--       `credited_minutes`) are never modified.
-- =============================================================================

begin;

-- Ensure column constraints remain strictly enforced (idempotent).
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

-- Perform safe, timestamp-guarded repair for legacy active sessions whose
-- `user_settings` row was not modified after `started_at`.
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

-- Surface any ambiguous active sessions (where settings changed after start)
-- in migration logs without mutating their stored threshold.
do $$
declare
    v_ambiguous_count integer := 0;
begin
    select count(*)::integer into v_ambiguous_count
    from public.focus_sessions fs
    join public.user_settings s on s.user_id = fs.user_id
    where fs.status in ('running', 'paused')
      and s.updated_at > fs.started_at
      and (
          fs.min_valid_minutes = fs.planned_minutes * 2
          or fs.min_valid_minutes = 1
      )
      and fs.min_valid_minutes < coalesce(s.min_valid_focus_minutes, 1);

    if v_ambiguous_count > 0 then
        raise notice 'focus_snapshot_backfill_safety: preserved % ambiguous active session(s) where user_settings.updated_at > focus_sessions.started_at',
            v_ambiguous_count;
    end if;
end $$;

commit;
