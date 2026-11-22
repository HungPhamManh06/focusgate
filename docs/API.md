# FocusGate – API

The backend exposes **no custom HTTP API**. Clients talk to Supabase directly
(PostgREST + Realtime) with the anon key and a user JWT; authorization is RLS and
privileges. This document defines the contracts the web app, Android app and
Windows agent use, and the server-side rules they must not bypass.

## 1. Conventions

- Base URL: `https://<project>.supabase.co` (local: `http://127.0.0.1:54321`).
- `apikey`: anon key. `Authorization: Bearer <access_token>` for user requests.
- All user tables have RLS; a request without a valid JWT sees nothing.
- Timestamps are ISO-8601 UTC. Dates are `YYYY-MM-DD` in the user's timezone.
- Errors are PostgREST errors: `{ code, message, details, hint }`. Business
  errors raised by RPCs use SQLSTATE `55000` / `42501` / `P22023` and a message
  prefixed with a stable code (`plan_requirements_unmet: …`).

## 2. Authentication

| Operation | Supabase call |
|---|---|
| Register | `auth.signUp({ email, password, options: { data: { display_name } } })` |
| Sign in | `auth.signInWithPassword({ email, password })` |
| Sign out | `auth.signOut()` |
| Password reset | `auth.resetPasswordForEmail(email, { redirectTo })` |
| Refresh | `auth.refreshSession()` (SDK handles expiry) |
| Profile | `from('profiles').select().eq('id', user.id).single()` |
| Devices | `from('devices').select()` / `rpc('rpc_revoke_device', { p_device_id })` |

A new user automatically gets a `profiles` row and `user_settings` defaults via
an `auth.users` trigger. The client never inserts them. Display names are
trimmed/truncated safely, and profile updates reject blank names or unknown IANA
timezones.

## 3. Direct table access (RLS-scoped)

Allowed for ordinary CRUD:

- `profiles`, `devices`, `tasks`, `block_rules`, `usage_events`,
  `device_sync_states`
- `daily_plans` / `daily_plan_tasks` only while the plan is `draft`
- `user_settings` **select only** (reward configuration is server-controlled)
- `daily_plan_events` **select only** (audit history is RPC-written)
- `focus_sessions` **select only** (start/complete/cancel through RPCs)
- `unlock_grants`, `reward_ledger` **select only**

Forbidden by privilege, not just by UI: any insert/update/delete on
`focus_sessions`, `daily_plan_events`, `user_settings`, `unlock_grants` or
`reward_ledger`.

## 4. RPC contracts

### `rpc_create_daily_plan(p_plan_date date default null) → jsonb`

```json
{ "planId": "uuid", "created": true }
```

### `rpc_add_plan_task(p_plan_id, p_task_id, p_kind, p_planned_start, p_planned_minutes) → jsonb`

```json
{ "planTaskId": "uuid", "created": true }
```

Draft plans only. `kind` defaults to the task's kind; the plan task snapshots
`required_focus_minutes` at that moment.

### `rpc_confirm_plan(p_plan_id) → jsonb`
### `rpc_activate_plan(p_plan_id) → jsonb`

```json
{ "status": "confirmed", "changed": true }
```

Requires at least one Must Do task. Invalid transitions raise
`invalid plan transition: …`.

### `rpc_amend_plan_task(p_plan_task_id, p_new_kind, p_reason) → jsonb`

```json
{ "changed": true, "exception": true }
```

Downgrading a committed Must Do requires a reason of ≥5 characters and writes a
`daily_plan_events` row of type `exception_granted`.

### `rpc_complete_plan_task(p_plan_task_id) → jsonb`

```json
{ "completed": true, "alreadyCompleted": false, "focusMinutes": 25 }
```

Fails with `plan_requirements_unmet: 0 of 25 required focus minutes recorded`
when coverage is missing. Never fires from a timer.

### `rpc_complete_plan(p_plan_id) → jsonb`

```json
{ "status": "completed", "changed": true }
```

### `rpc_start_focus_session(p_device_id, p_client_id, p_planned_minutes, p_mode, p_task_id?, p_daily_plan_id?) → jsonb`

```json
{
  "sessionId": "uuid",
  "status": "running",
  "startedAt": "2026-11-21T09:00:00Z",
  "plannedMinutes": 25,
  "minValidMinutes": 5,
  "idempotent": false
}
```

- The server sets `started_at`; the client cannot submit a timestamp.
- `client_id` is 8–100 characters and idempotent per `(device_id, client_id)`.
- Snapshots the user's current `min_valid_focus_minutes` into `focus_sessions.min_valid_minutes` and enforces `planned_minutes * 2 >= min_valid_minutes` (`invalid_input` if the 2× credit cap is below the minimum threshold).
- Requires an active device owned by the caller, and refuses a second open
  session (`focus_session_active`).
- Optional task/plan must belong to the caller; a plan-linked session requires a
  task that is part of that plan.

### `rpc_complete_focus_session(p_session_id) → jsonb`

```json
{
  "sessionId": "uuid",
  "actualMinutes": 26,
  "creditedMinutes": 26,
  "plannedMinutes": 25,
  "minValidMinutes": 5,
  "isValid": true,
  "endedAt": "2026-11-21T09:26:00Z",
  "idempotent": false
}
```

The server derives elapsed minutes from its own clock, validates against the session's snapshotted `min_valid_minutes`, and caps `credited_minutes` at `min(actual_minutes, planned_minutes * 2)`. The client does not send minutes. Replaying a completed session is idempotent.

### `rpc_cancel_focus_session(p_session_id) → jsonb`

```json
{ "sessionId": "uuid", "cancelled": true, "idempotent": false }
```

Records a cancelled session with zero minutes. Completed/cancelled sessions
cannot be modified.

### `rpc_evaluate_unlock(p_plan_id, p_device_id, p_idempotency_key) → jsonb`

```json
{
  "grantId": "uuid",
  "grantedMinutes": 35,
  "remainingMinutes": 35,
  "idempotent": false,
  "breakdown": { "base": 30, "bonus": 5, "extraFocus": 0, "cappedAt": 35 }
}
```

- The plan must be `completed`, not merely `active`.
- `idempotency_key`: 8–150 chars, unique per user.
- Replay (same key, or any key again for the same plan) returns the existing grant
  with `"idempotent": true`.
- Reusing a key for another plan raises `idempotency_conflict`.
- One base grant per plan is enforced by a partial unique index and a per-plan
  advisory lock.

### `rpc_consume_unlock_minutes(p_grant_id, p_device_id, p_minutes, p_idempotency_key) → jsonb`

```json
{
  "grantId": "uuid",
  "consumedMinutes": 10,
  "remainingMinutes": 25,
  "idempotent": false
}
```

- Row lock plus a per-key advisory lock prevents two devices spending concurrently.
- The key is bound to the original grant, minute count and device; replaying it
  with different parameters raises `idempotency_conflict`.
- Errors: `grant_not_found`, `grant_expired`, `grant_exhausted`.
- Replaying the same key returns the stored result and **does not** spend again.
- A revoked device cannot spend.

### `rpc_revoke_device(p_device_id) → jsonb`

```json
{ "revoked": true, "revokedGrants": 1 }
```

Also cancels the device's open focus sessions so it cannot leave a server-timed
session running after revocation.

## 5. Error codes

| Code in message | Meaning | Client behaviour |
|---|---|---|
| `not_authenticated` | Missing/expired JWT | Sign in again |
| `forbidden` | Row/device/plan not owned | Do not retry; refresh state |
| `plan_not_found` | Plan missing | Create today's plan |
| `plan_not_active` | Wrong state for the operation | Refresh the plan |
| `plan_requirements_unmet` | Tasks or focus incomplete | Show what is missing |
| `plan_expired` | Unlock window passed | No grant; next plan |
| `grant_exhausted` | Balance too low | Offer focus/plan flow |
| `grant_expired` | Window ended | Re-evaluate tomorrow |
| `focus_session_active` | Another session is open | Finish or cancel it |
| `focus_session_closed` | Session completed/cancelled | Refresh focus state |
| `idempotency_conflict` | Key reused with different parameters | Generate a new key; do not retry blindly |
| `invalid_input` | Validation failure | Surface message |

## 6. Sync protocol (Phase 4)

Because Phase 0 defines the tables, the protocol is fixed now:

**Pull**

```http
GET /rest/v1/tasks?user_id=eq.<uid>&updated_at=gt.<cursor>&order=updated_at.asc
GET /rest/v1/daily_plans?user_id=eq.<uid>&updated_at=gt.<cursor>
GET /rest/v1/block_rules?device_id=eq.<device>&updated_at=gt.<cursor>
```

Store the maximum `updated_at` seen in `device_sync_states.cursor`.

**Push**

- Focus sessions: `rpc_start_focus_session` / `rpc_complete_focus_session` with
  the device's stable `client_id`; a replay returns the same session. Direct
  `POST /rest/v1/focus_sessions` is denied by privilege.
- Usage events: same with `client_event_id`.
- Task edits: `PATCH` with `updated_at` precondition; if the server row is newer,
  fetch and apply the server version (last-write-wins).
- Plan mutations: never pushed directly — the device replays the RPC.

Rewards are never pushed. The device asks the server to evaluate.

## 7. Realtime

Planned channels (Phase 4):

| Channel | Payload | Consumer |
|---|---|---|
| `device:<id>:policy` | `{ policyVersion, rules[] }` | Android/Windows apply new block policy |
| `user:<id>:rewards` | `{ grantId, remainingMinutes, status }` | Wallet UI |
| `user:<id>:plans` | `{ planId, status }` | Planner UI |

Realtime is a notification mechanism only. A client that receives a reward event
still reads the authoritative row; it never credits itself.

## 8. Windows agent / Android device authentication (Phase 1)

Design constraints, not yet implemented:

1. The device signs in with the user's Supabase session (device code flow) or a
   short-lived device pairing token created from the web dashboard.
2. The backend stores only a device id, public key and status. Refresh tokens
   are sealed on-device (DPAPI on Windows, Keystore on Android).
3. Every sync request re-checks `devices.status = 'active'` and that
   `device.user_id = auth.uid()`.
4. A revoked device can read nothing and its grants are revoked.
5. No endpoint accepts a command to execute on the device. The agent pulls
   policy; it never accepts shell instructions.

## 9. Things deliberately absent

- No mock endpoints, no seeded production data, no client-side reward
  calculation, no service-role key in any client.
- No Edge Function yet. When added (Phase 4/5), it will hold the service role and
  call the same RPCs, never duplicate their logic.
