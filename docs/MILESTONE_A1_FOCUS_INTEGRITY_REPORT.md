# FOCUSGATE — MILESTONE A1: FOCUS SESSION INTEGRITY & TIMER RELIABILITY REPORT

**Date:** 2026-11-22  
**Scope:** Web Focus Screen (`/focus`), Focus Timer (`focus-timer.tsx`), PostgreSQL Focus Session Validation (`20260101000004_focus_session_integrity.sql`), Focus Data Layer, and Task/Reward Focus Progress Integration.

---

## 1. Root Cause of the Over-Time Invalidation Bug

In Phase 0 (`supabase/migrations/20260101000001_init.sql`, lines 294–301), the `fn_validate_focus_session` trigger enforced both a lower bound and a hard upper bound on `is_valid`:

```sql
new.is_valid := new.actual_minutes >= v_min_valid
    and new.actual_minutes <= new.planned_minutes * 2
    and new.actual_minutes > 0;
```

Meanwhile, the Frontend timer (`apps/web/app/(app)/focus/focus-timer.tsx`, line 38) checked only the lower bound:

```ts
const willBeValid = elapsedSeconds >= minValidMinutes * 60;
```

Furthermore, `FocusTimer` counted `elapsedSeconds` up indefinitely past `plannedMinutes` with no "Target Reached" or "Overtime" state transition. When a user started a 25-minute Pomodoro session and worked for 56 minutes (or left the tab running slightly past 50 minutes), the UI displayed a green banner asserting *"This session is long enough to count. End it whenever you are ready."* Yet upon clicking **End & log session**, `rpc_complete_focus_session` derived `actual_minutes = 56`, and the trigger evaluated `56 <= 25 * 2 (50)` as `false` — marking `is_valid = false` and discarding the entire 56-minute session.

---

## 2. Actual vs. Valid vs. Credited Focus Minutes Rules

Milestone A1 establishes a deterministic, three-part model enforced at the PostgreSQL layer:

1. **Actual Elapsed Time (`actual_minutes`):**
   - The true wall-clock elapsed minutes between `started_at` and `ended_at` (`floor((ended_at - started_at) / 60)`, clamped to `0..600`).
   - Never overwritten by the credit cap so historical audit logs accurately reflect how long the session ran.
2. **Valid Session Status (`is_valid`):**
   - `true` if and only if `status = 'completed'`, `ended_at >= started_at`, `planned_minutes between 1 and 600`, and `actual_minutes >= max(user_settings.min_valid_focus_minutes, 1)`.
   - Working past `planned_minutes` or past `2 × planned_minutes` **never** flips `is_valid` to `false`.
3. **Credited Focus Minutes (`credited_minutes`):**
   - The authoritative number of focus minutes credited toward task completion, daily plan progress, statistics, and extra-focus reward calculation:
     $$\text{credited\_minutes} = \begin{cases} \min(\text{actual\_minutes},\; \text{planned\_minutes} \times 2) & \text{if } \text{status} = \text{'completed'} \land \text{is\_valid} = \text{true} \\ 0 & \text{otherwise} \end{cases}$$

| Planned (`planned_minutes`) | Actual (`actual_minutes`) | Min Valid (`min_valid_focus_minutes = 5`) | Valid (`is_valid`) | Credited (`credited_minutes`) |
|---:|---:|---:|:---:|---:|
| 25m | 3m | 5m | `false` | **0m** |
| 25m | 5m | 5m | `true` | **5m** |
| 25m | 25m | 5m | `true` | **25m** |
| 25m | 40m | 5m | `true` | **40m** |
| 25m | 50m | 5m | `true` | **50m** |
| 25m | 56m | 5m | `true` | **50m** |
| 25m | 90m | 5m | `true` | **50m** |

---

## 3. Database Migration (`20260101000004_focus_session_integrity.sql`)

A new forward-only migration `supabase/migrations/20260101000004_focus_session_integrity.sql` was added without modifying prior migrations:

1. **Schema Addition:** Added `credited_minutes integer not null default 0 check (credited_minutes between 0 and 1200)` to `public.focus_sessions`.
2. **Safe Historical Backfill:** Temporarily disabled user triggers on `public.focus_sessions` to backfill `credited_minutes = least(greatest(actual_minutes, 0), planned_minutes * 2)` on existing `status = 'completed' and is_valid = true` rows, while setting `0` on all invalid/cancelled/running rows. Historical sessions that were previously marked `is_valid = false` remain `is_valid = false` with `credited_minutes = 0`.
3. **Trigger Replacement (`fn_validate_focus_session`):** Recomputes both `is_valid` and `credited_minutes` server-side on every insert or update. Clients cannot inject `is_valid = true` or a forged `credited_minutes`.
4. **Local PGlite Auto-Upgrade (`apps/web/lib/db/index.ts`):** If a local `.data/postgres` PGlite directory already exists from an earlier session, `createDatabase()` checks `information_schema.columns` for `focus_sessions.credited_minutes` and applies migration `0004` automatically.

---

## 4. Updated PostgreSQL Views & RPCs

Every backend consumer of focus time now uses `credited_minutes`:

- **`public.v_plan_progress` (View):** `must_do_focus_done` now sums `fs.credited_minutes` across valid sessions linked to the plan's Must-do tasks.
- **`public.rpc_complete_focus_session(p_session_id uuid)`:** Derives `actual_minutes` from the server clock, triggers `fn_validate_focus_session`, and returns `{ sessionId, actualMinutes, creditedMinutes, plannedMinutes, isValid, endedAt, idempotent }`. Replaying completion on an already-completed session returns the stored values with `idempotent: true`.
- **`public.rpc_complete_plan_task(p_plan_task_id uuid)`:** Verifies `coalesce(sum(fs.credited_minutes), 0) >= v_pt.required_focus_minutes` before marking the plan task and underlying task completed.
- **`public.rpc_evaluate_unlock(p_plan_id uuid, p_device_id uuid, p_idempotency_key text)`:** Sums `fs.credited_minutes` both for aggregate `v_focus_done` (extra focus reward blocks) and for the per-task focus coverage guard.

---

## 5. Frontend & Data Layer Synchronization

All web queries and TypeScript contracts were aligned with `credited_minutes`:

- **Contracts:** Added `creditedMinutes: number` to `FocusSession` in `packages/shared-contracts/src/index.ts` and `apps/web/lib/data/types.ts`.
- **Focus Data (`apps/web/lib/data/focus.ts`):**
  - `SESSION_SELECT` selects `fs.credited_minutes`.
  - `getTodayFocusSummary()` sums `credited_minutes filter (where is_valid)`.
  - `completeFocusSession()` returns `actualMinutes`, `creditedMinutes`, `plannedMinutes`, `isValid`, and `idempotent`.
- **Planner Data (`apps/web/lib/data/planner.ts`):** Per-task `focus_done` subquery in `loadPlan()` sums `fs.credited_minutes`.
- **Statistics Data (`apps/web/lib/data/stats.ts`):** Daily and period focus totals sum `credited_minutes` from valid completed sessions.
- **Dashboard & Focus Session Lists (`apps/web/app/(app)/page.tsx`, `daily-mission-card.tsx`, `focus/page.tsx`):** Displays credited minutes and explicitly notes when the 2× cap was applied (e.g., `50 min credited (56 min elapsed)`).

---

## 6. FocusTimer State Transitions (`apps/web/lib/domain/focus-timer-state.ts`)

`computeFocusTimerState()` derives 5 distinct, deterministic states from `elapsed = nowMs - Date.parse(session.startedAt)`:

| Phase | Trigger Condition | Header / Ring Label | Progress Ring | Banner Title & Guidance |
| :--- | :--- | :--- | :--- | :--- |
| **1. Below Minimum (`below_min`)** | `elapsed < minValidMinutes` | `FOCUSING` / `Focusing` | `0% – 99%` | `Minimum Xm required` — Warns that ending early earns `0m` credit and opens a confirmation modal if clicked. |
| **2. Focusing (`focusing`)** | `minValidMinutes <= elapsed < plannedMinutes` | `FOCUSING` / `Focusing` | `20% – 99%` | `Minimum focus duration reached` — Shows projected credit (`Est. credit: Xm`) subject to server verification. Never claims *"This session is valid"* prior to backend confirmation. |
| **3. Target Reached (`target_reached`)** | `plannedMinutes <= elapsed < plannedMinutes + 1m` (until user clicks `Keep focusing`) | `TARGET REACHED` / `Target reached` | `100%` (clamped) | `Minimum focus duration reached · Planned target complete` — Offers `[End & log session]` and `[Keep focusing]`. |
| **4. Overtime (`overtime`)** | `elapsed >= plannedMinutes` (after target window or clicking `Keep focusing`) and `< 2 × plannedMinutes` | `OVERTIME` / `Overtime` | `100%` (clamped) | `Minimum focus duration reached · Overtime in progress` — Displays `+MM:SS overtime` and explains the `2×` credit ceiling. |
| **5. Credit Limit Reached (`credit_limit_reached`)** | `elapsed >= 2 × plannedMinutes` | `FOCUS CREDIT LIMIT REACHED` / `Credit limit reached` | `100%` (warning tone) | `Focus credit limit reached (2× planned credited)` — Clearly states that additional elapsed time will not increase focus credit for this session. |

---

## 7. Error Recovery & Timestamp Authority

- **Server-Timestamp Authority:** `FocusTimer` never increments a local counter via `setInterval`. On every tick—and immediately upon `window` `focus` and `document` `visibilitychange` events—it recomputes `elapsedSeconds = Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 1000)`.
- **Browser Refresh / Tab Close / Sleep:** Because `getActiveSession()` loads the open `running` row from PostgreSQL on page render, refreshing the browser or reopening `/focus` after computer sleep immediately restores the exact phase (`focusing`, `target_reached`, `overtime`, or `credit_limit_reached`).
- **Network Failure Recovery:** If `completeFocusAction` fails due to a transient network error, `FocusTimer` transitions to an explicit `error` banner (`"Verification could not complete"`) with a **`Retry end & log session`** button. It never creates a new session or discards the active session on network failure.

---

## 8. Duplicate Submission Prevention

1. **Client-Side In-Flight Lock:** `FocusTimer` uses an immediate synchronous `inFlightRef.current` guard plus React `useTransition` (`isBusy`) to disable buttons on the first click, preventing double-tap race conditions.
2. **Database Row Locking & Idempotent Replay:** `rpc_complete_focus_session` acquires a row lock (`SELECT * FROM public.focus_sessions WHERE id = p_session_id AND user_id = v_uid FOR UPDATE`). If the first request already committed (`v_session.status = 'completed'`), any retry or duplicate request returns the existing `actualMinutes`, `creditedMinutes`, and `isValid` with `'idempotent', true` without modifying data or double-counting progress.
3. **Reward Ledger Idempotency:** `rpc_evaluate_unlock` uses `pg_advisory_xact_lock`, unique `(user_id, idempotency_key)`, and unique partial index `ux_unlock_grants_base_per_plan` so two concurrent or retried submissions never create duplicate grants or ledger entries.

---

## 9. Focus Page Metrics, Empty States & Mode Labels

- **`PLAN FOCUS LEFT` (`apps/web/app/(app)/focus/page.tsx`):**
  - When no plan exists or `mustDoTotal === 0`: displays **`Not configured`** with hint *"Add Must-do tasks to establish today's focus target"* and `tone="default"` (eliminating the false green `0m` success state).
  - Only uses `tone="success"` when `mustDoTotal > 0`, `focusRequired > 0`, and `focusDone >= focusRequired`.
- **`VALID RATE`:**
  - When `summary.sessions === 0`: displays **`—`** with hint *"No completed sessions yet."* (eliminating misleading `0%`).
- **`TODAY'S GATE`:**
  - When `mustDoTotal === 0`: displays **`Not configured`** (*"Add 1–5 Must-do tasks in your Planner."*) with an `Open Planner` button instead of `0m / 0m verified` and `0/0`.
- **Mode Label Formatting (`FOCUS_MODE_LABELS`):**
  - Centralized in `apps/web/lib/domain/focus-timer-state.ts`:
    - `pomodoro_25_5` → `"Pomodoro 25/5"`
    - `pomodoro_50_10` / `deep_50_10` → `"Deep Work 50/10"`
    - `custom` → `"Custom"`
    - `open_ended` → `"Open-ended"`
    - Unknown future modes fall back to clean human-readable capitalization.

---

## 10. Regression Test Results

### 10.1. Database Verification Suite (`npm run db:verify` — `scripts/verify-db.mjs`)
All **85 / 85 checks passed** against real PostgreSQL semantics (PGlite), including the 15 new Milestone A1 checks covering `A1–A12`:
- `A1`: Session below minimum duration (`3m < 5m`) → `isValid = false`, `actualMinutes = 3`, `creditedMinutes = 0`.
- `A2`: Session at exact minimum duration (`5m`) → `isValid = true`, `actualMinutes = 5`, `creditedMinutes = 5`.
- `A3`: Session at exact planned duration (`25m / 25m`) → `isValid = true`, `actualMinutes = 25`, `creditedMinutes = 25`.
- `A4`: Session over planned duration but under 2× (`40m / 25m`) → `isValid = true`, `actualMinutes = 40`, `creditedMinutes = 40`.
- `A5`: Session at exact 2× planned duration (`50m / 25m`) → `isValid = true`, `actualMinutes = 50`, `creditedMinutes = 50`.
- `A6 & A7`: Sessions exceeding 2× planned duration (`56m / 25m` and `90m / 25m`) → **`isValid = true`**, `actualMinutes` preserved (`56` and `90`), **`creditedMinutes` capped at `50`**.
- `A8`: Invalid `planned_minutes` (`0` or `601`) rejected with `22023`.
- `A9`: Duplicate `rpc_complete_focus_session` calls return `idempotent = true` and `v_plan_progress` sums `credited_minutes` (`50 + 50 = 100`), never raw `actual_minutes` (`56 + 90 = 146`).
- `A10`: `rpc_complete_plan_task` and `rpc_evaluate_unlock` compute extra-focus reward (`30 base + 5 extra = 35m`) strictly from verified `credited_minutes`.
- `A11`: Historical invalid sessions retain `is_valid = false` and `credited_minutes = 0`.
- `A12`: Duplicate `rpc_evaluate_unlock` calls return `idempotent = true` and create only 1 `reward_ledger` row.

### 10.2. Frontend Unit Test Suite (`npm run test -w @focusgate/web`)
All **12 / 12 unit tests passed** (`tests/dashboard-state.test.ts` + `tests/focus-integrity.test.ts`), covering `B1–B14`:
- `B1–B5`: `computeFocusTimerState` transitions across `below_min` (`03:15`), `focusing` (`05:00`, `18:24`), `target_reached` (`25:00`), `overtime` (`32:15`), and `credit_limit_reached` (`50:00`, `56:45`).
- `B6`: Timestamp-based recovery after simulated browser refresh / sleep.
- `B7–B11`: Pre-verification banner never claims `"This session is valid"`, and post-verification summaries format uncapped, capped (`50 min credited (56 min elapsed)`), and below-minimum sessions accurately.
- `B12–B14`: `buildFocusPageMetrics` and `formatFocusModeLabel` verify no `0%` valid rate on 0 sessions, no green success tone on empty plans, and clean mode labels.

---

## 11. Pause / Resume Technical Assessment (Section 9 Review)

### Current Backend & Schema Status
1. **Enum & Index Support:** `public.focus_session_status` (`20260101000001_init.sql#L25`) includes `'paused'`, and the partial unique index `ux_focus_sessions_one_open` (`20260101000003_backend_hardening.sql#L238-L240`) covers `WHERE status IN ('running', 'paused')`.
2. **Missing Schema Columns for Server-Authoritative Pause Accounting:**
   - Currently, `public.focus_sessions` has only `started_at` and `ended_at`.
   - `rpc_complete_focus_session` calculates `v_elapsed := floor(extract(epoch from (now() - v_session.started_at)) / 60)`.
   - There is **no** `paused_at timestamptz` or `accumulated_paused_seconds integer` column, nor `rpc_pause_focus_session` / `rpc_resume_focus_session` RPCs.
   - As documented in `docs/DATABASE.md` (Section 4, line 98): *"Pause/resume is not exposed because the server clock cannot verify paused time."*

### Engineering Decision for Milestone A1
- **Decision:** **Keep Focus Mode unpaused in Milestone A1** and update `docs/PRD.md` to reflect that active focus blocks are continuous (`running → completed | cancelled`), while retaining `'paused'` in the enum for future server-tracked pause intervals.
- **What is required if Pause/Resume is added in a future milestone:**
  1. Add `paused_at timestamptz` and `paused_duration_seconds integer not null default 0` (plus a `max_pause_count` or `max_pause_minutes` policy cap so users cannot pause a 25-minute session for 12 hours).
  2. Implement `rpc_pause_focus_session(p_session_id)` (sets `status = 'paused', paused_at = now()`) and `rpc_resume_focus_session(p_session_id)` (adds `now() - paused_at` to `paused_duration_seconds`, clears `paused_at`, sets `status = 'running'`).
  3. Update `rpc_complete_focus_session` and `fn_validate_focus_session` to subtract `paused_duration_seconds` from `ended_at - started_at`.

---

## 12. Follow-Up Hotfix (Milestone A1.1) & Remaining Scope
- **Milestone A1.1 Hotfix (`docs/MILESTONE_A1_1_FOCUS_RELIABILITY_REPORT.md`):**
  - **P1.1:** Separated Complete vs. Cancel error and retry states in `FocusTimer` so retrying a failed cancellation never calls `completeFocusAction`.
  - **P1.2:** Added migration `20260101000005_focus_validity_snapshot.sql` to snapshot `min_valid_minutes` on `public.focus_sessions` at session start and enforce `planned_minutes * 2 >= min_valid_minutes` on both backend and `FocusStarter`.
- Cross-screen deep-linking (`/focus?taskId=...` from Planner/Dashboard) and post-session one-click task completion prompt are scheduled for **Milestone B**.
- `/tasks` completed-task overdue badge cleanup and `/planner` interactive backlog picker are scheduled for **Milestone A2 / B**.
