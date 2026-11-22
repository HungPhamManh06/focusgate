# FocusGate – Database

PostgreSQL 15+ (Supabase). Seven migrations, executed and tested against real
PostgreSQL semantics.

```
supabase/migrations/20260101000001_init.sql                                    schema, RLS, views
supabase/migrations/20260101000002_plan_and_reward.sql                         plan + reward RPCs
supabase/migrations/20260101000003_backend_hardening.sql                       server-owned focus, constraints
supabase/migrations/20260101000004_focus_session_integrity.sql                 actual vs credited focus minutes
supabase/migrations/20260101000005_focus_validity_snapshot.sql                 session-level min_valid_minutes snapshot
| `20260101000006_legacy_snapshot_and_insert_hardening.sql` | Immutable historical migration (superseded by `0007` on local upgrades) |
| `20260101000007_focus_snapshot_backfill_safety.sql` | Forward-only timestamp-guarded safe backfill for active sessions |
supabase/seed.sql                                                              development data
```

## 1. Tables

| Table | Purpose | Key columns |
|---|---|---|
| `profiles` | Public user profile, 1:1 with `auth.users` | `id` → auth.users, validated IANA `timezone` |
| `user_settings` | Per-user reward configuration | `user_id` PK, reward fields; read-only to clients |
| `devices` | Registered devices | `user_id`, `platform`, `status`, unique `(id, user_id)` |
| `tasks` | Task catalogue | `user_id`, `kind`, `priority`, `required_focus_minutes`, `status` |
| `daily_plans` | One plan per user per date | unique `(user_id, plan_date)`, `status` |
| `daily_plan_tasks` | Commitment snapshot | `plan_id`, `task_id`, `kind`, `required_focus_minutes`, `completed_at` |
| `daily_plan_events` | Append-only audit history | `event_type`, `reason`, `payload`; RPC-only insert |
| `focus_sessions` | Server-owned focus evidence | `device_id`, `client_id`, `planned/min_valid/actual/credited_minutes`, `is_valid` |
| `block_rules` | Per-device app policy | `rule_type` block/allow, `identifier`, `category`, `action` |
| `unlock_grants` | Earned unlock windows | `granted/consumed/remaining`, `status`, `expires_at`, `idempotency_key` |
| `reward_ledger` | Append-only minute history | `delta_minutes`, `reason`, unique idempotency key |
| `usage_events` | Entertainment usage facts | `device_id`, `client_event_id`, `duration_seconds`, `was_blocked` |
| `device_sync_states` | Offline cursors | `last_pulled_at`, `last_pushed_at`, `pending_changes` |

### Relationships and tenant integrity

```
auth.users 1─1 profiles 1─1 user_settings
profiles 1─* devices
profiles 1─* tasks
profiles 1─* daily_plans 1─* daily_plan_tasks *─1 tasks
daily_plans 1─* daily_plan_events
profiles 1─* focus_sessions *─1 tasks / daily_plans (nullable)
devices 1─* focus_sessions / block_rules / usage_events
daily_plans 1─* unlock_grants 1─* reward_ledger
unlock_grants 1─* usage_events (nullable)
```

Migration `0003` adds `(id, user_id)` unique keys and composite foreign keys so
a row cannot reference another tenant's task, plan, device, grant or block rule
even when RLS is bypassed. `ON DELETE SET NULL (column)` keeps the owner column
intact when a nullable reference is cleared.

`daily_plan_tasks.task_id` uses `ON DELETE RESTRICT`: a task referenced by a plan
cannot be deleted, preserving history.

## 2. Enums

`task_kind` (must_do, should_do, bonus), `task_priority`, `task_category`,
`task_status`, `plan_status`, `plan_event_type`, `focus_mode`,
`focus_session_status`, `block_rule_type`, `block_category`, `block_action`,
`device_platform` (windows, android, web), `device_status`, `grant_status`,
`unlock_source`, `ledger_reason`.

## 3. Authentication bootstrap and profile validation

An `auth.users` insert creates `profiles` and `user_settings` rows. Display names
are trimmed, blank values fall back to the email local part and then to
"FocusGate user", and names are truncated to 80 characters, so sign-up cannot
fail on oversized metadata.

`profiles` inserts/updates reject blank display names and timezones that are not
present in `pg_timezone_names`.

## 4. Server-owned focus sessions

Clients have `SELECT` only on `focus_sessions`. Insert, update and delete are
revoked; the RPCs below are the only write path.

`rpc_start_focus_session(device, client_id, planned_minutes, mode, task?, plan?)`:

- requires an authenticated user and an active device owned by that user;
- `client_id` is 8–100 characters and idempotent per `(device_id, client_id)`;
- serializes starts per user with an advisory lock;
- reads the user's current `min_valid_focus_minutes`, snapshots it into
  `focus_sessions.min_valid_minutes`, and requires `planned_minutes * 2 >= min_valid_minutes`
  (rejecting impossible durations whose 2× credit cap is below the minimum threshold);
- refuses a second open session; a partial unique index
  `ux_focus_sessions_one_open` enforces this at the storage layer;
- refuses another user's task or plan, a completed/cancelled task, a closed
  plan, or a task that is not part of the plan;
- sets `started_at = now()` on the server.

`rpc_complete_focus_session(session)`:

- locks the session and checks ownership and an active device;
- derives `actual_minutes` from `floor((now() - started_at) / 60)`, clamped to
  0–600, so a client cannot claim time that did not elapse;
- `is_valid` and `credited_minutes` are recomputed by the trigger from
  server-derived minutes against the session's snapshotted `min_valid_minutes`
  (`credited_minutes = min(actual_minutes, planned_minutes * 2)` when `is_valid`);
- replay on an already completed session returns the stored result.

`rpc_cancel_focus_session(session)` records a cancelled session with zero
minutes. Completed/cancelled sessions are immutable via trigger.

Pause/resume is not exposed because the server clock cannot verify paused time.

## 5. Derived values

- `unlock_grants.remaining_minutes` = generated stored column
  `granted_minutes - consumed_minutes`.
- `tasks.completed_at` is set/cleared by trigger from `status`.
- `focus_sessions.is_valid` and `focus_sessions.credited_minutes` are recomputed
  on every insert/update:
  - `status = 'completed'` and `ended_at` present and ≥ `started_at`;
  - `actual_minutes ≥ focus_sessions.min_valid_minutes` (snapshotted at session
    start so mid-session settings changes do not alter active session rules),
    `planned_minutes * 2 ≥ focus_sessions.min_valid_minutes`, and
    `actual_minutes > 0`;
  - overtime beyond `planned_minutes × 2` does **not** invalidate the session;
    instead, `credited_minutes = least(actual_minutes, planned_minutes * 2)` when
    `is_valid = true` (and `0` when invalid or cancelled);
  - claimed minutes longer than wall-clock are clamped to elapsed minutes.
- Client-supplied `is_valid = true` or `credited_minutes` is overwritten.
  Validity and focus credit are never trusted from the client.

## 6. Focus and completion rules

A task can be completed through `rpc_complete_plan_task` only when:

1. the plan is `active`,
2. the plan task is not already completed,
3. the sum of `credited_minutes` across `is_valid` focus sessions for this exact
   `(task, plan)` is at least the plan task's `required_focus_minutes`.

Completing a focus session never marks a task done. The timer is evidence, not
the decision. `rpc_complete_plan` then requires every Must Do task to be complete.

## 7. Reward math

Defaults in `user_settings`:

| Setting | Default |
|---|---|
| `base_minutes` | 30 |
| `bonus_minutes_per_task` | 5 |
| `extra_focus_block_minutes` | 50 |
| `extra_focus_reward_minutes` | 5 |
| `max_bonus_minutes` | 30 |
| `daily_cap_minutes` | 60 |
| `min_valid_focus_minutes` | 1 |

`rpc_evaluate_unlock(plan, device, idempotency_key)`:

```
require auth, ownership, completed plan, plan_date <= today, active device
require every Must Do plan task completed (completed_at not null)
require per-task valid focus coverage for every completed plan task
bonus    = min(completed bonus tasks × bonus_minutes_per_task, max_bonus_minutes)
extra    = min(floor((valid must-do focus − required must-do focus) / 50) × 5,
               max_bonus_minutes − bonus)
granted  = min(base + bonus + extra, daily_cap_minutes)
expires  = (plan_date + 1 day) 04:00 in the user's timezone
```

A plan that is only `active` cannot be rewarded; it must be completed first.
Claiming is idempotent: the same key returns the same grant, a different key for
the same plan returns the existing base grant, and reusing a key for another
plan raises `idempotency_conflict`.

## 8. Idempotency and concurrency

| Risk | Control |
|---|---|
| Double grant via retry | unique `(user_id, idempotency_key)`; replay returns existing grant |
| Double grant via two devices | partial unique index on `daily_plan_id` where source = `daily_plan_base`; advisory lock per plan |
| Key reused with another plan | explicit `idempotency_conflict` check |
| Double spend via two devices | `SELECT … FOR UPDATE` on the grant row plus per-key advisory lock |
| Double spend via retry | unique `(user_id, idempotency_key)` on `reward_ledger` with `:consume` suffix |
| Key reused for another grant/minutes/device | explicit parameter-binding check raises `idempotency_conflict` |
| Offline duplicate focus session | unique `(device_id, client_id)` |
| Offline duplicate usage event | unique `(device_id, client_event_id)` |
| Client writes focus/rewards | table privileges revoked + guard triggers + one-open index |

RPC keys accept 8–150 characters. Ledger keys append `:grant` / `:consume` and
still fit the 200-character column constraint.

## 9. RLS and privileges

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| profiles | own | own | own (validated) | — |
| user_settings | own | — (trigger) | **revoked** | — |
| devices | own | own | own | own |
| tasks | own | own | own | own |
| daily_plans | own | own, draft only | own (lifecycle via RPC) | own, draft only |
| daily_plan_tasks | own | own, draft plan | own (guarded) | own, draft plan |
| daily_plan_events | own | **revoked** | — | — |
| focus_sessions | own | **revoked** | **revoked** | **revoked** |
| block_rules | own | own | own | own |
| unlock_grants | own | **no client path** | **no client path** | **no client path** |
| reward_ledger | own | **no client path** | **no client path** | **no client path** |
| usage_events | own | own | — | — |
| device_sync_states | own | own | own | — |

Plan and reward state can only be changed inside audited RPC transactions. The
reward guard requires the transaction-local `focusgate.rpc = on` flag, which only
SECURITY DEFINER functions set after validating every condition.

## 10. RPCs

| Function | Who | Effect |
|---|---|---|
| `rpc_create_daily_plan(date)` | authenticated | Get/create draft plan (idempotent). |
| `rpc_add_plan_task(plan, task, kind, start, minutes)` | authenticated | Draft only; snapshots kind + focus requirement. |
| `rpc_remove_plan_task(plan_task)` | authenticated | Draft only. |
| `rpc_confirm_plan(plan)` | authenticated | Requires ≥1 Must Do. |
| `rpc_activate_plan(plan)` | authenticated | Confirmed → active. |
| `rpc_amend_plan_task(plan_task, kind, reason)` | authenticated | Committed Must Do downgrade requires reason; writes history. |
| `rpc_complete_plan_task(plan_task)` | authenticated | Requires focus coverage; completes task + plan task. |
| `rpc_complete_plan(plan)` | authenticated | All Must Do done. |
| `rpc_start_focus_session(device, client_id, minutes, mode, task?, plan?)` | authenticated | Creates a server-timestamped running session. |
| `rpc_complete_focus_session(session)` | authenticated | Derives elapsed minutes and validity server-side. |
| `rpc_cancel_focus_session(session)` | authenticated | Cancels a running session with zero minutes. |
| `rpc_evaluate_unlock(plan, device, key)` | authenticated | Validates a completed plan and creates grant + ledger. |
| `rpc_consume_unlock_minutes(grant, device, minutes, key)` | authenticated | Row-locked, idempotent spend + ledger. |
| `rpc_revoke_device(device)` | authenticated | Revokes device, cancels its open sessions and revokes its grants. |
| `fn_expire_unlock_grants()` | owner/scheduler | Marks expired grants. |

All `SECURITY DEFINER` functions set `search_path = public, pg_temp`, check
`auth.uid()`, and filter every query by the caller's user id. Execute is granted
to `authenticated` only; `public` and `anon` are revoked.

## 11. Views

- `v_plan_progress` (`security_invoker`): Must Do total/completed, required and
  recorded focus, completed bonus count.
- `v_reward_wallet` (`security_invoker`): earned, consumed, currently remaining.

## 12. Indexes

Covering indexes exist for user+status, user+due date, plan tasks by plan and
kind, focus sessions by user/time and task/plan (valid only), one open session
per user (partial unique), active grants by expiry, ledger by user/time, usage by
user and device/time, and events by plan/time.

## 13. Running and verifying

```bash
# Hosted/local Supabase
supabase start
supabase db reset          # migrations + seed.sql

# Verification without Docker (PGlite, real PostgreSQL semantics)
npm install
npm run db:verify
```

Verification result on this workspace: **70/70 checks passed** — three migrations
apply, profile/auth bootstrap, RLS isolation, cross-account denial, RPC-only plan
and focus writes, server-derived focus time, one-open-session rule, completed-plan
reward gating, grant/consume idempotency, key-conflict detection, overdraft,
expiry, device revocation, composite tenant constraints and full RLS coverage.

The hosted Supabase project, `supabase db reset` and `seed.sql` have **not** been
executed in this environment: Docker Desktop is installed but WSL is not
registered, the Docker daemon is unavailable, and no Supabase access token or
project credentials exist. The schema and RPC contracts were verified with
PGlite, a real PostgreSQL build; they still need `supabase db reset` against a
real Supabase stack before production.
