# FocusGate Release & Operations Checklist (Phase 5)

## 1. Pre-Release Automated Verification

Run the full cross-platform suite before tagging a release:

```powershell
# 1. Web + Shared Contracts + PGlite Migrations & DB Invariants
npm run verify:all
npm run web:build

# 2. Windows Agent (Release build + xUnit tests)
dotnet test apps/windows-agent/FocusGate.Agent.slnx -c Release

# 3. Android (Personal & Managed flavors)
cd apps/android
.\gradlew.bat testPersonalDebugUnitTest testManagedDebugUnitTest assemblePersonalDebug assembleManagedDebug
```

## 2. Database & Hosted Supabase Deployment

Follow [SUPABASE_MIGRATION_RUNBOOK.md](./SUPABASE_MIGRATION_RUNBOOK.md) strictly:
- Verify all migrations `0001` through `0009` (`20260101000009_focus_pause_resume.sql`) against the linked remote project (`supabase migration list --linked`).
- Never run unguarded migration `0006` backfill against an existing `0005` database; supersede `0006` and apply `0007..0009`.
- Verify RLS is enabled on all user tables and `SECURITY DEFINER` RPCs enforce `auth.uid()` + device ownership.

## 3. Web Deployment (Vercel)

Set required environment variables (never expose `SUPABASE_SERVICE_ROLE_KEY` to `NEXT_PUBLIC_*`):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_APP_URL`

Verify after deploy:
- `/login` renders Sign in / Sign up / Reset password.
- Unauthenticated requests to `/`, `/tasks`, `/planner`, `/focus`, `/wallet`, `/statistics`, `/devices` redirect to `/login`.
- `/api/devices/register`, `/api/agent/policy`, `/api/agent/usage` return `401` without a valid Bearer JWT or session cookie.

## 4. Windows Agent Packaging & Operations

- Build Release binary:
  ```powershell
  dotnet publish apps/windows-agent/src/FocusGate.Agent.Poc/FocusGate.Agent.Poc.csproj -c Release -r win-x64 --self-contained false
  ```
- Register a workstation:
  ```powershell
  FocusGate.Agent.Poc.exe --register --api-url https://your-app.vercel.app --token <jwt>
  ```
- Inspect local state & logs:
  - `--status` prints registration state, DPAPI path (`%LocalAppData%\FocusGate\Agent\credentials.dpapi`), and JSONL log directory (`%LocalAppData%\FocusGate\Agent\logs`).
  - Cached policy lives at `policy-cache.json`; offline queued usage telemetry lives at `usage-queue.json`.

## 5. Rollback Plan

1. **Web:** Roll back to the previous Vercel deployment from the Vercel dashboard.
2. **Database:** Migrations `0001..0009` are forward-only; never truncate user data or mutate `0001..0009` in place.
3. **Devices:** If an agent build misbehaves, revoke affected devices from `/devices` (`rpc_revoke_device`) to immediately stop sync and cancel open sessions.
