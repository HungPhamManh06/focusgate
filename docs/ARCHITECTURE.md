# FocusGate – Architecture

Status: Phase 0 complete. Web app, Android production app and hosted Supabase
project are **not** built yet.

## 1. Repository layout

```
focusgate/
├── apps/
│   ├── web/                          # Phase 1 (Next.js dashboard)
│   ├── android/                      # Kotlin/Compose PoC
│   └── windows-agent/
│       ├── FocusGate.Agent.slnx
│       ├── poc-policy.json
│       └── src/FocusGate.Agent.Poc/
│           ├── Models/               # policy, options, observations
│           ├── Monitors/             # foreground hook, process discovery
│           ├── Services/             # decision engine, SQLite, self-test
│           ├── UI/                   # block overlay
│           └── Native/               # Win32 interop
├── packages/
│   └── shared-contracts/             # TypeScript domain contracts
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   │   ├── 20260101000001_init.sql
│   │   └── 20260101000002_plan_and_reward.sql
│   └── seed.sql
├── scripts/verify-db.mjs             # migrations + RLS + reward invariants
├── docs/
└── package.json                      # npm workspaces
```

Deviations from the proposed structure, and why:

| Deviation | Reason |
|---|---|
| No `apps/web` yet | Phase 0 gate: product development starts in Phase 1. |
| `slnx` solution format | .NET 10 default; supported by current SDK/MSBuild. |
| `daily_plan_events`, `user_settings` tables added | Immutable exception history and per-user reward configuration are hard requirements. |
| `scripts/verify-db.mjs` | Executes migrations and RLS against real PostgreSQL (PGlite) without Docker. |
| `packages/shared-contracts` is TS-only | Web is the only consumer today; Android and the agent mirror the contracts in Kotlin/C# with tests in Phase 1. |

## 2. Components

```
┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│  Web dashboard   │       │  Android app     │       │  Windows agent   │
│  Next.js (RSC)   │       │  Kotlin/Compose  │       │  C# / .NET 10    │
└────────┬─────────┘       └────────┬─────────┘       └────────┬─────────┘
         │ supabase-js (anon key)   │ HTTPS + device token     │ HTTPS + device token
         │                          │                          │
         ▼                          ▼                          ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ Supabase                                                                 │
│  Auth (JWT) → PostgREST → PostgreSQL (RLS + SECURITY DEFINER RPCs)        │
│  Realtime (broadcast policy/reward changes)                              │
│  Service role only in Edge Functions / server code, never in clients     │
└──────────────────────────────────────────────────────────────────────────┘
```

### Web (Phase 1)
Next.js App Router, server components for reads, server actions/route handlers
only where a server secret is needed. Browser uses the anon key and the user
JWT. Tailwind + shadcn/ui, light/dark. No business rules duplicated client-side:
plan transitions, task completion and reward evaluation go through RPCs.

### Android
`AppUsageMonitorService` (foreground service, `specialUse`) polls
`UsageStatsManager` for foreground transitions and writes aggregated local
usage to Room. `AppBlockAccessibilityService` observes only
`TYPE_WINDOW_STATE_CHANGED` package names and launches the block screen.
`BootReceiver` restores monitoring. Policy is read from Room and refreshed from
the backend in Phase 4. DevicePolicyManager is the future route for real
enforcement on managed devices.

### Windows agent
Phase 0 is a console/tray-style PoC:
- `ForegroundWindowMonitor` uses `SetWinEventHook(EVENT_SYSTEM_FOREGROUND)` with
  a 500 ms polling fallback.
- `WindowInspector` resolves the real process behind UWP frames
  (`ApplicationFrameHost`) and reads the AppUserModelId.
- `EnforcementEngine` is pure logic; `MonitorHost` applies log/minimize/
  terminate/overlay.
- `SqliteEventStore` keeps a local, WAL-mode event log.
- `SelfTest` measures capabilities instead of assuming them.

Production agent (Phase 4): per-user tray application, autostart via per-user
Run key or scheduled task, state in `%LOCALAPPDATA%`, credentials sealed with
DPAPI, no elevation by default, no remote command channel. A Windows service is
only used for watchdog duties that do not need an interactive desktop.

## 3. Trust boundaries

| Boundary | Rule |
|---|---|
| Browser ↔ Supabase | Anon key only; RLS is the authorization layer. Service role never ships. |
| Agent/device ↔ backend | Device row must be `active`; capabilities limited to that user's data. Revocation invalidates grants bound to the device. |
| Database RPC ↔ tables | Clients cannot write `unlock_grants` / `reward_ledger`; writes only inside RPCs that set a transaction-local flag after validation. |
| Agent ↔ OS | The agent observes and enforces only user-selected apps. It never executes backend-supplied commands, never injects into processes, never installs drivers. |
| Reward grant ↔ client | A client request is a *claim*. Replay is idempotent; a plan yields at most one base grant. |

## 4. Backend authority

The backend decides:

- whether a plan transition is legal (state machine + RPC-only writes),
- whether focus time is valid (computed trigger; client `is_valid` ignored),
- whether a Must Do task may be completed (per-task focus coverage),
- how many minutes a plan grants (user settings, caps, bonus math),
- whether a grant may still be spent (expiry, status, remaining balance).

The client decides only presentation and *intent* (start focus, mark done,
request unlock). This is enforced at the database layer, not only in UI code.

## 5. Sync model

All writes carry client-generated identifiers where possible:

- `focus_sessions.client_id` + `device_id` unique → offline replay safe.
- `usage_events.client_event_id` + `device_id` unique.
- `unlock_grants.idempotency_key` unique per user; partial unique index allows
  one `daily_plan_base` grant per plan.
- `reward_ledger.idempotency_key` unique per user.

Conflict resolution:

| Entity | Rule |
|---|---|
| Task content | Last-write-wins by `updated_at`; server timestamp wins on tie. Deletes are explicit. |
| Daily plan status | Server-only transitions; a stale client cannot rewind a plan. |
| Plan task composition | Editable only in draft; afterwards amendments are RPCs with history. |
| Focus session | Append-only; completion is a one-way transition enforced by trigger. |
| Rewards | Server arithmetic; device never computes a balance it can spend. |
| App-lock policy | Per-device; last-write-wins by `policy_version`, with the device pulling full policy snapshots. |

`device_sync_states` stores per-device cursors so a reconnecting client can pull
changes after `last_pulled_at` and push queued items. Phase 4 implements the
endpoints; the table exists now.

## 6. Security architecture

- RLS on every public table; policies scope by `auth.uid()`.
- Composite foreign keys `(device_id, user_id)` make cross-user device use a
  storage-level error, not a code-path oversight.
- `SECURITY DEFINER` functions re-check `auth.uid()` and ownership because they
  bypass RLS; every lookup filters by user.
- Reward tables have no client write privileges and a trigger that rejects
  writes without the RPC transaction flag.
- Device credentials on Windows: DPAPI (`ProtectedData`, `CurrentUser` scope) for
  refresh tokens; Android: Keystore-backed encryption in Phase 1.
- No secrets in the repository. `.env.example` documents names only.
- Logging is local and structured; no app content or credentials are logged.

## 7. Deployment topology

| Piece | Target |
|---|---|
| Web | Vercel (Next.js) |
| Backend | Supabase hosted project (PostgreSQL 15+, Auth, Realtime) |
| Database changes | `supabase/migrations` via CLI; reviewed before production |
| Windows agent | Signed installer (MSIX or Inno Setup) in Phase 5 |
| Android | Play Console internal testing → production in Phase 5 |
| CI | GitHub Actions: typecheck, DB verification, .NET build/tests, Android build |

## 8. Phase 0 architecture findings that changed the plan

1. **Windows foreground hook works and is fast.** Event-driven detection plus a
   polling fallback is the right design; no driver is needed for Personal Strict
   Mode.
2. **Cross-process window control is reliable** on this build
   (`ShowWindow(SW_MINIMIZE)` verified), so minimize + overlay are viable.
3. **UWP apps require AUMID resolution**, otherwise every Store app looks like
   `ApplicationFrameHost`. Implemented in `WindowInspector`.
4. **Android needs two independent mechanisms.** UsageStats is telemetry only;
   accessibility detects windows; neither is tamper-proof. Managed Device Mode
   is the only path to real enforcement.
5. **Reward correctness belongs in PostgreSQL**, not Edge Functions. SQL
   transactions + constraints + RLS give stronger guarantees; Edge Functions
   will be reserved for integrations (e.g. email, webhooks).

## 9. Open architecture decisions

- Android foreground service vs WorkManager-only monitoring (battery vs latency).
- Whether the Windows agent should be a tray app only, or tray app + per-user
  watchdog task for restart after termination.
- Realtime vs polling cadence for policy updates on Android (FCM vs sync loop).
- Hosting the web app on Vercel vs Cloudflare Workers (Phase 5 benchmark).
