# FocusGate

**Finish Your Tasks. Earn Your Freedom.**

FocusGate is a task manager with a gate: you commit to the day's Must Do tasks,
do verified focus work, and only then earn time in the entertainment apps you
chose to restrict.

> **Status: backend and web dashboard implemented and verified locally.**
> The database, RLS, plan lifecycle, server-owned focus sessions and reward
> engine are implemented across three migrations and 70 automated checks. The
> Next.js dashboard runs against the same PostgreSQL schema via PGlite. The
> Windows agent PoC runs; the Android PoC source is written but **not compiled**
> (no Android SDK on this machine). No hosted Supabase or Vercel deployment has
> been performed in this environment.

## What exists

| Component | Status | Evidence |
|---|---|---|
| Windows agent PoC (.NET 10) | Working | build 0 warnings; probe 6 pass / 0 fail / 2 skip; live monitor persisted a row |
| Database schema + RLS + RPCs | Working | 3 migrations; 70/70 automated checks on PGlite PostgreSQL |
| Web dashboard (Next.js) | Working locally | 6 screens; typecheck + production build pass; PGlite backend |
| Android PoC (Kotlin/Compose) | Source only | not built: no Android SDK / JDK 27 unsupported by AGP |
| Hosted Supabase / Vercel | Not deployed | needs a Supabase project and access token |

## Repository

```
apps/
  windows-agent/   C# PoC: foreground hook, policy engine, overlay, SQLite
  android/         Kotlin/Compose PoC: usage stats, accessibility block screen, Room
  web/             Next.js dashboard (local PGlite backend)
packages/
  shared-contracts/  TypeScript domain types shared with the future web app
supabase/
  migrations/      schema, RLS, plan lifecycle, focus and reward engine
  seed.sql         development users/tasks/plan/device policy
scripts/
  verify-db.mjs    runs migrations + 70 RLS/reward/focus assertions without Docker
docs/              PRD, architecture, database, API, platform analyses, roadmap, Phase 0 report
```

## Quick start

### Repository checks

```bash
npm install
npm run db:verify          # real PostgreSQL semantics via PGlite; 70 assertions
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

Requires Android Studio with JDK 17–21 and SDK 35. Open `apps/android` and follow
`apps/android/README.md`. It has **not** been compiled in this environment.

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

## Honest limits

- Personal Strict Mode is a friction layer, not tamper-proof DRM. Users can
  revoke permissions, kill the agent or uninstall the app.
- Windows cannot control elevated/protected apps without elevation or WDAC;
  the agent does not run elevated by default.
- Android cannot enforce without Device Owner provisioning; `UsageStatsManager`
  observes, Accessibility detects, neither is unbreakable.
- No driver, root, exploit or hidden surveillance is used or planned.
- Supabase hosted deployment was not performed: Docker/WSL and Supabase project
  credentials are unavailable here. The SQL was verified on PGlite (real
  PostgreSQL), but `supabase db reset` against a real Supabase stack is still
  required before production.

## Security

- Never commit service-role keys. Only the anon key belongs in the web client.
- Windows device credentials: DPAPI (`CurrentUser`). Android: Keystore (Phase 1).
- Report vulnerabilities privately once a security contact is published.
