# FOCUSGATE — MILESTONE A1.1: FOCUS RELIABILITY HOTFIX REPORT

**Date:** 2026-11-22  
**Baseline Commit:** `53128da16f15e74208a75e093c122fd6dcebdb36`  
**Scope:** Focus Timer Action-Intent Preservation (`P1.1`), Session-Level Minimum-Valid-Duration Snapshot & Credit-Cap Compatibility (`P1.2`), PostgreSQL Migration `0005`, Focus Starter Validation, and Regression Test Suites.

---

## 1. Root Causes of Both P1 Issues

### P1.1 — Shared Error State Between Complete and Cancel in `FocusTimer`
In Milestone A1 (`apps/web/app/(app)/focus/focus-timer.tsx`), `SubmissionState` had only a single generic error variant:
```ts
type SubmissionState =
  | { status: "idle" }
  | { status: "verifying" }
  | { status: "error"; message: string }
  | { status: "verified"; ... };
```
Both `performComplete()` and `performCancel()` wrote `{ status: "error", message }` on failure, and `performCancel()` closed the Cancel confirmation dialog in a `finally`/post-await path or rendered the main primary button as:
```tsx
<Button onClick={endSession} ...>
  {submission.status === "error" ? "Retry end & log session" : ...}
</Button>
```
Consequently, if a user clicked **Cancel → Discard session** and `cancelFocusAction()` failed due to a network error, the main card displayed **`Retry end & log session`** wired to `endSession()` (`completeFocusAction`). Clicking retry would complete and credit a session the user intended to discard.

### P1.2 — Minimum-Valid-Duration vs. 2× Credit-Cap Contradiction & Mid-Session Setting Drift
1. **Credit Cap Below Minimum Threshold:** `public.user_settings.min_valid_focus_minutes` allows values from `1` to `120`, while `credited_minutes` is capped at `planned_minutes * 2`. If a user had `min_valid_focus_minutes = 60` and started a `25 min` Pomodoro preset, the maximum possible credit was `50 min` (`25 × 2`), which is less than `60 min`. Around minute 50, the timer reached `credit_limit_reached` and projected `50m` of credit even though a 25-minute block could never legitimately earn 60 minutes of credit.
2. **Mid-Session Setting Drift:** `fn_validate_focus_session()` read `user_settings.min_valid_focus_minutes` dynamically at completion time rather than snapshotting the threshold when the session started. Furthermore, when `minValidMinutes > plannedMinutes` (e.g. `planned = 25m`, `minValid = 50m`), `computeFocusTimerState()` evaluated `if (isTargetReached)` before `if (meetsMinimumThreshold)`, causing the UI to transition to `target_reached` / `overtime` at minute 25–30 and display `30m` projected credit before the 50-minute minimum threshold was actually met.

---

## 2. Exact Implementation Decisions

### 2.1. Action-Intent Preserving Submission State Machine (`P1.1`)
- Refactored `FocusSubmissionState` in `apps/web/lib/domain/focus-timer-state.ts` and `apps/web/app/(app)/focus/focus-timer.tsx` into 6 explicit states:
  - `idle`
  - `completing` (`"Verifying session…"`)
  - `cancelling` (`"Cancelling session…"`)
  - `complete_error` (`"Retry end & log session"`)
  - `cancel_error` (`"Retry cancel session"`)
  - `verified` (authoritative backend completion payload)
- Extracted pure, unit-tested coordinators `executeFocusCompleteFlow()` and `executeFocusCancelFlow()` plus `getFocusSubmissionUiLabels()`:
  - **Complete failure (`complete_error`):** Displays `"Could not verify & complete session"`, keeps the short-session dialog open if triggered from there, and wires **`Retry end & log session`** exclusively to `performComplete()` (`completeFocusAction(session.id)`).
  - **Cancel failure (`cancel_error`):** Keeps the Cancel `ConfirmDialog` open, renders the error alert inside the dialog and on the card, and wires **`Retry cancel session`** exclusively to `performCancel()` (`cancelFocusAction(session.id)`). The primary action bar also renders **`Retry cancel session`** (`variant="danger"`) when in `cancel_error` so retrying from anywhere on the screen only retries Cancel.
  - **Successful Cancel:** Resets `submission` to `{ status: "idle" }`, closes the Cancel `ConfirmDialog`, never enters `verified`, and awards `0` focus credit.
  - **Concurrency Guard:** Preserved the synchronous `inFlightRef.current` lock across both flows so rapid double-clicks while a request is in flight never issue duplicate server calls.

### 2.2. Session-Level `min_valid_minutes` Snapshot & Credit-Cap Guard (`P1.2`)
- **Snapshot at Session Start:** Added `min_valid_minutes integer not null default 1 check (min_valid_minutes between 1 and 120)` to `public.focus_sessions`.
- **Server-Side Compatibility Rule:** `rpc_start_focus_session` reads `user_settings.min_valid_focus_minutes`, stores it in `focus_sessions.min_valid_minutes`, and enforces:
  $$\text{planned\_minutes} \times 2 \ge \text{min\_valid\_minutes}$$
  If `p_planned_minutes * 2 < v_min_valid`, PostgreSQL rejects the call with SQLSTATE `22023` and message:
  `invalid_input: planned duration (X min, max credit 2X min) cannot satisfy minimum valid focus duration (Y min; plan at least ceil(Y/2) min)`.
- **Completion Against Stored Snapshot:** `fn_validate_focus_session()` validates `new.actual_minutes >= new.min_valid_minutes and (new.planned_minutes * 2) >= new.min_valid_minutes and new.actual_minutes > 0`. Changing `user_settings.min_valid_focus_minutes` while a session is running has zero effect on the active session.

---

## 3. Database Migrations & RPC Changes (`0005`, `0006`, & `0007` — Milestone A1.1.1 & A1.1.2 Hardening)

Created forward-only migrations [20260101000005_focus_validity_snapshot.sql](file:///c:/Users/hungv/Downloads/focusgate/supabase/migrations/20260101000005_focus_validity_snapshot.sql), [20260101000006_legacy_snapshot_and_insert_hardening.sql](file:///c:/Users/hungv/Downloads/focusgate/supabase/migrations/20260101000006_legacy_snapshot_and_insert_hardening.sql), and [20260101000007_focus_snapshot_backfill_safety.sql](file:///c:/Users/hungv/Downloads/focusgate/supabase/migrations/20260101000007_focus_snapshot_backfill_safety.sql):

1. **`focus_sessions.min_valid_minutes` Schema & No-Default INSERT Hardening (Milestone A1.1.1 Issue 2):**
   - `min_valid_minutes integer not null` with `check (min_valid_minutes between 1 and 120)` and **no column default (`DEFAULT` dropped)**.
   - Why no column default? PostgreSQL evaluates column defaults *before* firing `BEFORE INSERT` triggers. When `DEFAULT 1` was present, any direct `INSERT` that omitted `min_valid_minutes` arrived in `fn_validate_focus_session()` with `NEW.min_valid_minutes = 1`, bypassing `if new.min_valid_minutes is null` and silently weakening the threshold to 1 minute.
   - By dropping the column default while keeping `NOT NULL` and `CHECK (min_valid_minutes between 1 and 120)` (which PostgreSQL enforces *after* the `BEFORE INSERT` trigger returns), an omitted `min_valid_minutes` arrives in `fn_validate_focus_session()` as `NULL`, causing the trigger to snapshot `user_settings.min_valid_focus_minutes` automatically.
2. **Timestamp-Guarded Safe Backfill & Protection of Legitimate Active Snapshots (Milestone A1.1.2):**
   - **Why the original `0006` could overwrite a legitimate snapshot:** Originally, `0006` updated any active (`running`/`paused`) session where `min_valid_minutes = planned_minutes * 2` or `min_valid_minutes = 1` and `min_valid_minutes < user_settings.min_valid_focus_minutes`. If a user started a 25-minute session when `min_valid_focus_minutes = 1` (legitimately snapshotting `1`) and then raised the workspace setting to `60` mid-session, `0006` would overwrite `1 → 60`, violating snapshot immutability.
   - **How the timestamp-based safe-repair rule works (`0007` and guarded `0006`):**
     - **Safe to repair (`user_settings.updated_at <= focus_sessions.started_at`):** The user's settings row has not been modified after the session started. Any active session still holding a clamped (`planned_minutes * 2`) or defaulted (`1`) threshold below `user_settings.min_valid_focus_minutes` is repaired to `user_settings.min_valid_focus_minutes` (without clamping to `2 × planned_minutes`).
     - **Ambiguous / Protected (`user_settings.updated_at > focus_sessions.started_at`):** The setting changed *after* the session started. The migration preserves the existing `min_valid_minutes` snapshot untouched and emits a `RAISE NOTICE` reporting the count of ambiguous rows rather than guessing.
   - **Irrecoverable Historical Limitation:** Sessions created before migration `0005` did not store `min_valid_focus_minutes` at start time. If `0006` already ran on a database before `0007` and overwrote a snapshot, or if settings changed after a pre-0005 session started, the exact original threshold cannot be reconstructed from the database and the migration preserves the available stored value without guessing.
3. **`public.fn_validate_focus_session()`:**
   - On `INSERT`, snapshots `user_settings.min_valid_focus_minutes` whenever `new.min_valid_minutes is null or new.min_valid_minutes < 1`. If an explicit positive value (`1..120`) is supplied (e.g. by `rpc_start_focus_session` or administrative test fixtures), clamps it to `1..120`. (Authenticated clients have `INSERT`/`UPDATE`/`DELETE` revoked on `public.focus_sessions` and can only start sessions through `rpc_start_focus_session`).
   - On `UPDATE`, strictly preserves `old.min_valid_minutes` so the snapshot is immutable after session start.
   - Evaluates validity against the session's `min_valid_minutes` and requires `(new.planned_minutes * 2) >= v_min_valid`.
4. **Reliable Local Migration Detection ([apps/web/lib/db/migrations.ts](file:///c:/Users/hungv/Downloads/focusgate/apps/web/lib/db/migrations.ts) & [apps/web/lib/db/index.ts](file:///c:/Users/hungv/Downloads/focusgate/apps/web/lib/db/index.ts)):**
   - Tracks applied migrations via `migration:<filename>` markers in `auth.local_meta`.
   - Fresh workspaces execute `0001..0007` once and record all markers. Existing workspaces at `0005` or `0006` upgrade incrementally without deleting data, and repeated initializations skip already-marked migrations.

---

## 4. Focus Starter & Focus Timer Synchronization

### 4.1. Focus Starter ([apps/web/app/(app)/focus/focus-starter.tsx](file:///c:/Users/hungv/Downloads/focusgate/apps/web/app/%28app%29/focus/focus-starter.tsx))
- Uses `evaluateFocusStarterOptions(minValidMinutes)` and `validatePlannedDurationAgainstMinValid()`:
  - Disables any preset where `2 * preset.minutes < minValidMinutes` (`disabled` + `aria-disabled`) and renders an inline explanation: *"Max credit is 50m (2× 25m), below your 60m minimum valid duration."*
  - If all presets are disabled (e.g. `minValidMinutes = 120`, where both 25m and 50m presets cap below 120m), automatically selects `Custom` mode and displays a clear guidance banner directing the user to choose a Custom block of at least `ceil(minValidMinutes / 2)` (`60m`).
  - Sets the Custom `<input type="number">` `min` attribute to `max(5, ceil(minValidMinutes / 2))`, displays the allowed range (`minutes (X–180 · max 2Y credit)`), validates on both client and server (`startFocusAction`), and never silently mutates the user's custom duration input.

### 4.2. Focus Timer ([apps/web/app/(app)/focus/focus-timer.tsx](file:///c:/Users/hungv/Downloads/focusgate/apps/web/app/%28app%29/focus/focus-timer.tsx) & [focus-timer-state.ts](file:///c:/Users/hungv/Downloads/focusgate/apps/web/lib/domain/focus-timer-state.ts))
- Uses `effectiveMinValidMinutes = session.minValidMinutes ?? minValidMinutes`.
- Fixes phase ordering when `minValidMinutes > plannedMinutes` (e.g. `planned = 25m`, `minValid = 50m`):
  - If `!meetsMinimumThreshold` (`elapsedSeconds < minValidSeconds`), the timer stays in `below_min` with `projectedCreditedMinutes = 0` even after passing `plannedSeconds` (`25:00`), explaining: *"Planned 25m reached, but your session requires 50m total to qualify for focus credit. Keep going."*
- Explicitly handles any legacy impossible session (`plannedMinutes * 2 < minValidMinutes`):
  - Sets `isImpossibleConfiguration = true`, `meetsMinimumThreshold = false`, `projectedCreditedMinutes = 0`, and displays a warning banner explaining that the session's 2× credit cap is below its minimum threshold.

---

## 5. Regression Test Cases & Results

### 5.1. PostgreSQL / PGlite Verification (`npm run db:verify` — [scripts/verify-db.mjs](file:///c:/Users/hungv/Downloads/focusgate/scripts/verify-db.mjs))
All **100 / 100 checks passed**, including 10 new Milestone A1.1 database checks:
1. `A1.1-B1`: `plannedMinutes = 25`, `minValidMinutes = 5` → accepted, snapshots `minValidMinutes = 5`.
2. `A1.1-B2`: `plannedMinutes = 25`, `minValidMinutes = 50` → accepted (boundary `25 * 2 == 50`), snapshots `minValidMinutes = 50`.
3. `A1.1-B3`: `plannedMinutes = 25`, `minValidMinutes = 51` → rejected with `invalid_input`.
4. `A1.1-B4`: `plannedMinutes = 30`, `minValidMinutes = 60` → accepted, snapshots `minValidMinutes = 60`.
5. `A1.1-B5`: `plannedMinutes = 50`, `minValidMinutes = 120` → rejected with `invalid_input`.
6. `A1.1-B6`: Active session started with `minValidMinutes = 15`, then `user_settings.min_valid_focus_minutes` raised to `60` mid-session, completed at `20m` → validated against snapshotted `15m` (`isValid = true`, `creditedMinutes = 20`).
7. `A1.1-B7`: Active session started with `minValidMinutes = 20`, then `user_settings.min_valid_focus_minutes` lowered to `5` mid-session, completed at `12m` → validated against snapshotted `20m` (`isValid = false`, `creditedMinutes = 0`).
8. `A1.1-B8` (via `A6/A7`): Overtime session retains actual elapsed time (`56m`) and applies 2× credit cap (`50m`).
9. `A1.1-B10`: Legacy session with `min_valid_minutes = 60` and `planned_minutes = 25` is safely marked `isValid = false` with `creditedMinutes = 0` upon completion.

### 5.2. Frontend Unit Tests (`npm run test` — [apps/web/tests/focus-integrity.test.ts](file:///c:/Users/hungv/Downloads/focusgate/apps/web/tests/focus-integrity.test.ts))
All **17 / 17 unit tests passed** (`4` in `dashboard-state.test.ts` + `13` in `focus-integrity.test.ts`), covering:
- **Complete vs. Cancel Retry Flows (`A1.1-A`):**
  - Complete failure → `complete_error`, label `"Retry end & log session"`, retry calls Complete and never calls Cancel.
  - Cancel failure → `cancel_error`, Cancel dialog stays open, label `"Retry cancel session"`, retry calls Cancel and never calls Complete.
  - Successful Cancel closes dialog, resets to `idle` (never `verified`), and creates no credit.
  - Synchronous `inFlightRef` blocks duplicate concurrent calls while in flight (`"Cancelling session…"` / `"Verifying session…"`).
- **Minimum Duration vs. Credit Cap (`A1.1-B`):**
  - Cases 1–5 (`25/5` accepted, `25/50` accepted, `25/51` rejected, `30/60` accepted, `50/120` rejected) + preset disabling and Custom minimum duration `ceil(minValidMinutes / 2)`.
  - Boundary timer behavior when `plannedMinutes = 25, minValidMinutes = 50` at `30:00` (`projectedCreditedMinutes = 0`, `below_min`) vs `50:00` (`projectedCreditedMinutes = 50`, `credit_limit_reached`).
  - Legacy impossible session (`plannedMinutes = 25, minValidMinutes = 60`) always shows `0m` projected credit and an explicit warning banner.

---

## 6. Remaining Limitations & Verification Scope

- **Verified in this environment:** Fresh database migration sequence (`0001..0005`) via `npm run db:verify`, seeded workspace verification via `node scripts/verify-local-seed.mjs`, incremental upgrade on existing `.data/postgres` PGlite database, TypeScript typecheck across `packages/shared-contracts` and `apps/web`, unit test suite (`17/17`), and Next.js production build (`npm run build -w @focusgate/web`).
- **Not verified in this environment:** Hosted/remote Supabase deployment (`supabase db reset` against a Docker/cloud Supabase instance) and physical Android/Windows device sync, as no remote Supabase credentials or Docker daemon are configured in this workspace.
