# FocusGate – Web Application (`apps/web`)

Next.js 15 (App Router) + React 19 + TypeScript + Tailwind CSS v4.

## 1. Architecture & Data Layer

- **Server-First Data Access (`apps/web/lib/data/*`):** All reads run in Server Components via `withUser()` (`apps/web/lib/db/index.ts`), which executes queries inside a transaction with `role = authenticated` and `request.jwt.claim.sub` bound to the active user so RLS policies and `SECURITY DEFINER` RPCs behave identically to Supabase PostgREST.
- **Local PGlite Persistence:** In local development, `.data/postgres` runs embedded PostgreSQL (PGlite) initialized from `supabase/migrations/20260101000001_init.sql` through `20260101000008_focus_migration_compatibility.sql`. `applyLocalMigrations()` (`apps/web/lib/db/migrations.ts`) tracks applied migrations (`migration:<filename>`), durable supersession intent (`pending_supersede:<filename>`), and completed supersession (`"superseded_by_0007"`) in `auth.local_meta`:
  - **Applied (`"1"`):** Migration SQL executed on this workspace.
  - **Pending Supersession (`pending_supersede:0006`):** Written before running `0007` on a `0005` workspace so an interruption or failed `0007` never causes `0006` to be misclassified as `"1"` or prematurely marked `"superseded_by_0007"`.
  - **Superseded (`"superseded_by_0007"`):** Recorded only after `0007` completes successfully; `0008` ensures identical trigger/constraint parity.
  - **Hosted Supabase:** Hosted deployments do **not** use `applyLocalMigrations()`; operators must follow [docs/SUPABASE_MIGRATION_RUNBOOK.md](file:///c:/Users/hungv/Downloads/focusgate/docs/SUPABASE_MIGRATION_RUNBOOK.md) using `--remote` flags.
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
npm run db:verify                 # Runs migrations 0001..0008 + 116 PGlite security/integrity checks
npm run test                      # Runs Node.js unit test suites in apps/web/tests/*.test.ts (22 tests)
npm run typecheck                 # Runs tsc --noEmit across all workspaces
npm run web:build                 # Builds production Next.js bundle
```
