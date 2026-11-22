# FocusGate – Web Application (`apps/web`)

Next.js 15 (App Router) + React 19 + TypeScript + Tailwind CSS v4.

## 1. Architecture & Data Layer

- **Server-First Data Access (`apps/web/lib/data/*`):** All reads run in Server Components via `withUser()` (`apps/web/lib/db/index.ts`), which executes queries inside a transaction with `role = authenticated` and `request.jwt.claim.sub` bound to the active user so RLS policies and `SECURITY DEFINER` RPCs behave identically to Supabase PostgREST.
- **Local PGlite Persistence:** In local development, `.data/postgres` runs embedded PostgreSQL (PGlite) initialized from `supabase/migrations/20260101000001_init.sql` through `20260101000007_focus_snapshot_backfill_safety.sql`. `applyLocalMigrations()` (`apps/web/lib/db/migrations.ts`) tracks applied migrations in `auth.local_meta` (`migration:<filename>`) so existing workspaces upgrade cleanly without deleting data and repeated boots never re-run applied migrations.
- **Server Actions (`apps/web/lib/actions/*`):** Mutations validate inputs with Zod (`apps/web/lib/validation.ts`), call PostgreSQL RPCs, and revalidate affected routes.

## 2. Focus Mode Reliability & Invariants (`/focus`)

### 2.1. Session-Level Validity Snapshot (`min_valid_minutes`)
- When a user starts a focus session (`FocusStarter` → `startFocusAction` → `rpc_start_focus_session`), the backend snapshots `user_settings.min_valid_focus_minutes` into `focus_sessions.min_valid_minutes`.
- Because focus credit is capped at `2 × planned_minutes`, any configuration where `planned_minutes * 2 < min_valid_minutes` is impossible to validate. Both `FocusStarter` and `rpc_start_focus_session` enforce:
  $$\text{planned\_minutes} \ge \lceil \text{min\_valid\_minutes} / 2 \rceil$$
- Presets in `FocusStarter` whose 2× cap falls below `minValidMinutes` are disabled with an inline explanation, and Custom session duration enforces a minimum of `max(5, ceil(minValidMinutes / 2))`.
- `FocusTimer` evaluates progress strictly against `session.minValidMinutes` so changing user settings mid-session never shifts the active session's validity threshold.

### 2.2. Action-Intent Preserving Submission State Machine (Complete vs. Cancel)
- `FocusTimer` (`apps/web/app/(app)/focus/focus-timer.tsx`) and `apps/web/lib/domain/focus-timer-state.ts` maintain distinct states for completing vs. cancelling a session:
  - `idle`
  - `completing` (`"Verifying session…"`)
  - `cancelling` (`"Cancelling session…"`)
  - `complete_error` (`"Retry end & log session"` → retries `completeFocusAction(session.id)`)
  - `cancel_error` (`"Retry cancel session"` → retries `cancelFocusAction(session.id)`)
  - `verified` (authoritative backend completion result)
- If `cancelFocusAction` fails due to a network error, the Cancel confirmation dialog remains open with the error message and a **`Retry cancel session`** button. Retrying a failed cancellation can never invoke `completeFocusAction` or award focus credit.

## 3. Verification Commands

```bash
npm run db:verify                 # Runs migrations 0001..0005 + 100 PGlite security/integrity checks
npm run test                      # Runs Node.js unit test suites in apps/web/tests/*.test.ts
npm run typecheck                 # Runs tsc --noEmit across all workspaces
npm run build -w @focusgate/web   # Builds production Next.js bundle
```
