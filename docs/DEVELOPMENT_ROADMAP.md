# FocusGate – Development Roadmap

The plan is gated: no phase starts before the previous phase's acceptance
criteria are met and recorded. Phase 0 is complete with evidence in
`docs/PHASE0_VALIDATION.md`.

## Phase 0 – Technical validation ✅ (done)

**Goal:** prove what the OS actually allows before building the product.

Delivered:

- Windows PoC: foreground hook, UWP identity, process control, cross-process
  minimize, SQLite log, capability probe, live monitor.
- Android module (`personal` & `managed` flavors): Usage Access + `TYPE_APPLICATION_OVERLAY`
  block screen (no `AccessibilityService`), Device Owner `setPackagesSuspended`,
  Room policy, boot restore, permission UX, 22 unit tests per flavor.
- Database: 3 migrations, RLS, server-owned focus sessions, reward RPCs, 74
  automated checks on PGlite.
- Web dashboard (local dev): 6 screens running against PGlite (`LOCAL_USER_ID`,
  dev-only auth).
- Documents: PRD, architecture, database, API, platform lock analyses, this
  roadmap, Phase 0 report, Milestone 1 audit and test report.

Acceptance evidence:

| Item | Result |
|---|---|
| .NET build | 0 warnings, 0 errors (warnings-as-errors) |
| Windows capability probe | 5 passed, 0 failed, 3 skipped (headless); 6 passed / 0 failed / 2 skipped (interactive) |
| Windows live monitor | event captured and persisted in interactive session (~1 ms decision/apply) |
| Database verification | 74 passed, 0 failed (PGlite, 3 migrations, incl. multi-device checks) |
| Android build & unit tests | `personalDebug` & `managedDebug` built (JDK 17 + SDK 36); 22/22 unit tests per flavor; **physical device (Redmi Note 13 / Android 15) pending** |
| Web dashboard | `typecheck` + `next build` pass; 6/6 routes HTTP 200 locally (PGlite) |
| Hosted Supabase | not run: no project credentials |

**Exit decision:** proceed with Windows Personal Strict Mode and the backend
design. Android is conditionally approved pending a real device build/test plan.

## Phase 1 – Foundation

**Goal:** a runnable monorepo with auth, devices and real data.

Milestones:

1.1 Web scaffold
- Next.js App Router, TypeScript strict, Tailwind, shadcn/ui, light/dark shell.
- Supabase browser/server clients; env validation; no service role in client.
- Acceptance: `next build` passes; sign-up/sign-in/sign-out/reset work against a
  local Supabase; protected routes redirect.

1.2 Database in a real Supabase stack
- `supabase start`, `supabase db reset`, seed run.
- Fix any seed/auth differences found against the real stack.
- Acceptance: migrations + seed apply cleanly; `npm run db:verify` still passes.

1.3 Device management
- Device registration on first login; list, rename, revoke.
- Acceptance: two browsers/devices see the same account; revoke stops access.

1.4 Windows agent skeleton
- Tray app shell, DPAPI credential store, device registration, policy pull
  (not enforcement yet), structured logging.
- Acceptance: agent registers as a device, survives restart, shows status.

1.5 Android skeleton
- Build the PoC in Android Studio on JDK 17/21, fix compile issues, install on a
  physical device, run the manual test script from `apps/android/README.md`.
- Acceptance: documented device test results (block latency, reboot, revocation).

## Phase 2 – Core product

2.1 Tasks UI/API (CRUD, filters, priorities, recurrence).
2.2 Daily planner (draft → confirm → activate) using the RPCs.
2.3 Focus mode (Pomodoro/custom, pause/resume, session upload with `client_id`).
2.4 Dashboard and basic statistics.
2.5 Task completion gated by focus coverage.

Acceptance: a user can plan a day, run focus sessions, complete Must Do tasks,
and see accurate progress; no client can bypass RPC validation (tested with
direct API calls).

## Phase 3 – Reward engine

3.1 Wallet, ledger and history UI (read-only grants/ledger).
3.2 Unlock evaluation UI and edge cases (bonus, extra focus, cap).
3.3 Consumption flow (manual "start entertainment" timer in Phase 3; automatic
usage tracking in Phase 4).
3.4 Settings for reward configuration with validation.
3.5 Concurrency and idempotency tests across two sessions.

Acceptance: grant math matches `docs/DATABASE.md`; replays never duplicate;
two devices cannot overspend; expiry works; ledger sums equal wallet.

## Phase 4 – App lock

4.1 Android monitoring + block screen on real devices (device matrix).
4.2 Android permission-loss UX and boot restore hardening.
4.3 Windows agent policy sync, overlay/minimize/terminate, watchdog.
4.4 Policy editor in the web dashboard (per device, categories, allowlist).
4.5 Usage ingestion and reward consumption integration.
4.6 Lock state visible on all devices; revocation propagates.

Acceptance: measured block latency targets met; false positives zero in test
list; permission loss surfaced; no remote command execution; revocation blocks
sync and spending.

## Phase 5 – Integration and release

5.1 Offline queue + conflict resolution across two devices.
5.2 Security review: RLS, RPC abuse, secret handling, DPAPI/Keystore, OWASP.
5.3 Performance: DB query plans, p95 API latency, agent memory/CPU, Android battery.
5.4 Packaging: signed MSIX/installer, Android release build, Play internal test.
5.5 Docs: deployment, operations, privacy policy, support runbook.
5.6 Deployment: Vercel + hosted Supabase, migrations applied, backups verified.

Acceptance: release checklist signed; rollback plan documented; observability in
place; privacy policy published; Play data-safety declaration matches reality.

## Cross-cutting engineering standards

- TypeScript strict; C# nullable enabled; Kotlin null-safety; no warnings ignored.
- Business rules live once: SQL RPCs/triggers for authority, shared contracts for
  types, pure functions for policy decisions.
- Every new table: RLS on, policies tested, indexes reviewed.
- Every milestone: build + the relevant automated check, with output recorded.
- No feature is "done" from UI alone; it must have a working backend path and an
  error/empty/loading state.

## Known risks and owners

| Risk | Impact | Mitigation | Phase |
|---|---|---|---|
| Android OEM background restrictions | Monitoring silently stops | Foreground service + status + physical-device matrix tests (incl. Xiaomi HyperOS) | 1/4 |
| Play policy rejection for special access | App cannot ship | No AccessibilityService used; explicit Usage Access, Overlay & `specialUse` FGS declarations | 4/5 |
| Overlay blocked or dismissed by OEM | Block screen does not appear | Detect failure, post notification, show Degraded status; Managed Mode uses `setPackagesSuspended` | 4 |
| Windows user kills/elevates agent | Protection bypassed | Watchdog + honest UX; managed mode only for real enforcement | 4 |
| Reward bugs | Trust damage | DB constraints + idempotency + concurrency tests | 3 |
| Scope creep into "unblockable" promises | Legal/reputation | Explicit Personal vs Managed mode language everywhere | all |
| Recurrence/timezone complexity | Wrong plans | Plan date in user timezone; tests around DST | 2 |

## Immediate next step

Phase 1, milestone 1.1–1.2: scaffold the Next.js app and run the migrations and
seed against a real local Supabase (`supabase start` / `supabase db reset`).
