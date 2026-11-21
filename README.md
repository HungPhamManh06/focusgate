# FocusGate

**Finish Your Tasks. Earn Your Freedom.**

FocusGate is a task manager with a gate: you commit to the day's Must Do tasks,
do verified focus work, and only then earn time in the entertainment apps you
chose to restrict.

> **Status: Phase 0 stabilized and hardened locally (Milestone 1.2.2).**
> The database, RLS, plan lifecycle, server-owned focus sessions and reward
> engine are implemented across three migrations and 74 automated checks on
> PGlite PostgreSQL. The Next.js dashboard runs locally against the same schema
> via PGlite (`LOCAL_USER_ID` is local development only, not production auth).
> The Windows agent PoC builds and passes `--selftest`; the Android module
> (`personal` and `managed` flavors) compiles and passes **82/82 unit tests per
> flavor** (164 total). Physical-device testing (Redmi Note 13 / Android 15) and
> hosted Supabase/Vercel deployment have **not** been performed yet.

## What exists

| Component | Status | Evidence |
|---|---|---|
| Windows agent PoC (.NET 10) | Working (PoC) | `dotnet build` 0 warnings / 0 errors; `--selftest` 5 pass / 0 fail / 3 skip (headless) |
| Database schema + RLS + RPCs | Working locally | 3 migrations; 74/74 automated checks on PGlite PostgreSQL (incl. multi-device) |
| Web dashboard (Next.js) | Working locally | 6 screens (HTTP 200); `typecheck` + `next build` pass; local PGlite backend |
| Android module (Kotlin/Compose) | Compiled & unit-tested | `personalDebug` & `managedDebug` APKs built; 82/82 unit tests per flavor; emulator-tested (API 36), **physical device untested** |
| Hosted Supabase / Vercel | Not deployed | needs a Supabase project, real Auth and credentials |

## Repository

```
apps/
  windows-agent/   C# PoC: foreground hook, policy engine, overlay, SQLite
  android/         Kotlin/Compose module: Usage Access + overlay (personal), Device Owner (managed), Room
  web/             Next.js dashboard (local PGlite backend, dev-only auth)
packages/
  shared-contracts/  TypeScript domain types shared with the web app
supabase/
  migrations/      schema, RLS, plan lifecycle, focus and reward engine
  seed.sql         development users/tasks/plan/device policy
scripts/
  verify-db.mjs    runs 3 migrations + 74 RLS/reward/focus/multi-device assertions without Docker
  verify-local-seed.mjs  verifies the web app's local PGlite seed workspace
docs/              PRD, architecture, database, API, platform analyses, roadmap, audit & test reports
```

## Quick start

### Repository checks

```bash
npm ci
npm run db:verify          # real PostgreSQL semantics via PGlite; 74 assertions
npm run typecheck          # strict TypeScript for all workspaces
npm run build -w @focusgate/web
```

### Web dashboard

```bash
npm run dev -w @focusgate/web
# http://localhost:3000
```

The local app runs the real migrations in PGlite and seeds one development
workspace. Delete `apps/web/.data/postgres` after changing migrations to rebuild
from scratch.

### Windows agent

```bash
cd apps/windows-agent
dotnet build src/FocusGate.Agent.Poc/FocusGate.Agent.Poc.csproj

# Capability probe (opens a short-lived PoC window to test minimize)
dotnet run --project src/FocusGate.Agent.Poc -- --selftest

# Observe foreground apps for 20 seconds (no enforcement)
dotnet run --project src/FocusGate.Agent.Poc -- --monitor --seconds 20 --enforce log

# Optional soft enforcement against the starter policy
dotnet run --project src/FocusGate.Agent.Poc -- --monitor --seconds 20 --enforce overlay
```

The PoC never touches another application unless `--enforce` is explicitly passed.
Local events are stored in `apps/windows-agent/agent-poc-data/`.

### Android

Requires **JDK 17** (AGP 8.13.2 / Gradle 8.13 are incompatible with JDK 27),
**Android SDK Platform 36**, and **Build Tools 36.0.0**. Two flavors exist:

- `personal` (`com.focusgate.app`): Usage Access + `TYPE_APPLICATION_OVERLAY` (no AccessibilityService).
- `managed` (`com.focusgate.app.managed`): Device Owner `setPackagesSuspended`.

```bash
cd apps/android
./gradlew :app:assemblePersonalDebug :app:assembleManagedDebug \
  :app:testPersonalDebugUnitTest :app:testManagedDebugUnitTest
```

See [apps/android/README.md](apps/android/README.md) and
[docs/ANDROID_LOCK.md](docs/ANDROID_LOCK.md) for emulator and physical-device
testing notes.

### Database (real Supabase)

```bash
supabase start
supabase db reset      # runs migrations + seed.sql
```

Until a Supabase project exists, use `npm run db:verify` for the schema, RLS and
reward invariants. `.env.example` lists the required variables; no real keys are
in the repository.

## Core rules encoded in the backend

- A plan is `draft → confirmed → active → completed`; transitions are RPC-only.
- A committed Must Do task cannot be removed. Downgrading it requires a reason
  and is written to immutable plan history.
- A task is complete only when the user asks **and** its required valid focus
  minutes exist. A finished timer alone never completes a task.
- Focus sessions are server-owned: clients cannot insert or update them, the
  server sets `started_at`, derives elapsed minutes and computes validity, and
  only one session may be open per user.
- A completed plan grants at most one base unlock: 30 min base, +5 per Bonus
  task, +5 per 50 extra focus minutes, extra cap 30, daily cap 60 (configurable).
- Clients cannot insert or update `unlock_grants` / `reward_ledger`; grants are
  idempotent, a reused key with different parameters is rejected, and spending
  is row-locked with an idempotency key.
- RLS on every table, composite `(id, user_id)` foreign keys across tasks/plans/
  devices/grants, and SECURITY DEFINER RPCs that re-check ownership.
- Cross-account denial is covered by automated tests, not just UI assumptions.

## Documentation

- [Product requirements](docs/PRD.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Database](docs/DATABASE.md)
- [API contracts](docs/API.md)
- [Android app lock](docs/ANDROID_LOCK.md)
- [Windows app lock](docs/WINDOWS_LOCK.md)
- [Roadmap](docs/DEVELOPMENT_ROADMAP.md)
- [Phase 0 validation report](docs/PHASE0_VALIDATION.md)
- [Milestone 1 initial audit](docs/MILESTONE1_INITIAL_AUDIT.md)
- [Milestone 1 test report](docs/MILESTONE1_TEST_REPORT.md)
- [Milestone 1.1 test report](docs/MILESTONE1_1_TEST_REPORT.md)
- [Milestone 1.2 test report](docs/MILESTONE1_2_TEST_REPORT.md)
- [Milestone 1.2.1 test report](docs/MILESTONE1_2_1_TEST_REPORT.md)
- [Milestone 1.2.2 test report](docs/MILESTONE1_2_2_TEST_REPORT.md)

## Honest limits

- Personal Strict Mode is a friction layer, not tamper-proof DRM. Users can
  revoke permissions, kill the agent or uninstall the app.
- Windows cannot control elevated/protected apps without elevation or WDAC;
  the agent does not run elevated by default.
- Android Personal Strict Mode uses `UsageStatsManager` + `SYSTEM_ALERT_WINDOW`
  overlay (no `AccessibilityService`), which is revocable friction. Real
  platform enforcement requires Managed Device Mode (Device Owner provisioning
  with `setPackagesSuspended`). Physical-device testing on Redmi Note 13 /
  Android 15 is still pending.
- No driver, root, exploit or hidden surveillance is used or planned.
- Web Dashboard currently uses PGlite with a hardcoded `LOCAL_USER_ID` for
  local development only; it is **not** production authentication.
- Supabase hosted deployment was not performed: Docker/WSL and Supabase project
  credentials are unavailable here. The SQL was verified on PGlite (74
  assertions), but `supabase db reset` against a real Supabase stack is still
  required before production.

## Security

- Never commit service-role keys. Only the anon key belongs in the web client.
- Windows device credentials: DPAPI (`CurrentUser`). Android: Keystore (Phase 1).
- Report vulnerabilities privately once a security contact is published.
