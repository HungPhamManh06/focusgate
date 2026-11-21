# Phase 0 – Technical Validation Report

Date: 2026-11-21 · Status: **complete, conditional go**

Scope: verify what Android, Windows and PostgreSQL actually allow before building
the product. Nothing in this report is inferred from documentation alone where a
local measurement was possible.

## 1. Environment

| Item | Value |
|---|---|
| Workspace | `C:\Users\hungv\Downloads\focusgate` (started empty except `.freebuff`) |
| OS | Windows 11, build 10.0.26300 |
| .NET SDK | 10.0.400 |
| Node / npm | 24.17.0 / 12.0.1 |
| Java | 27.0.1 (outside the Android Gradle Plugin support matrix) |
| Android SDK | **not installed** (`ANDROID_HOME` empty, no SDK directory) |
| Docker | CLI 29.5.3 present, **daemon not running**; Postgres container could not be used |
| PostgreSQL client | not installed |
| Supabase CLI / hosted project | not available in this environment |
| Git | repository initialized during Phase 0 |

Because Docker and Supabase were unavailable, the migrations were executed
against **PGlite 0.5.17** (PostgreSQL compiled to WASM), which preserves real
PostgreSQL parsing, transactions, constraints, triggers, RLS and PL/pgSQL
semantics. A Supabase-compatible `auth` schema (`auth.users`, `auth.uid()`) and
the `anon`/`authenticated` roles were stubbed for the test harness only.

## 2. Windows agent

### 2.1 Build

```
dotnet build src/FocusGate.Agent.Poc/FocusGate.Agent.Poc.csproj
Build succeeded. 0 Warning(s) 0 Error(s)
```

Warnings are treated as errors. The initial build failed on NuGet audit
`GHSA-2m69-gcr7-jv3q` (SQLitePCLRaw 2.1.11); the project was pinned to
`Microsoft.Data.Sqlite 10.0.15`, which resolves the patched 2.1.14 native
package. This is a real supply-chain finding, not a suppressed warning.

### 2.2 Capability probe (`--selftest`)

```
Foreground window           Pass    Freebuff (pid 16368), title resolved
Foreground event hook       Pass    EVENT_SYSTEM_FOREGROUND installed; WinForms pump
Process enumeration         Pass    6 interactive processes in 18 ms
UWP identity (AUMID)        Skip    foreground app was not a Store app
Process control rights      Pass    terminate=True, thread suspend=True (same user)
Window enforcement          Pass    ShowWindow(SW_MINIMIZE) cross-process: accepted, iconified
SQLite local log            Pass    schema created, row written/read
Elevation                   Skip    not elevated (per-user apps manageable; elevated not)
Summary: 6 passed, 0 failed, 2 skipped
```

Interpretation:

- Foreground event-driven detection is viable; **no kernel driver is needed** for
  Personal Strict Mode.
- Cross-process window manipulation works on this build, so minimize and overlay
  are real enforcement options, not mock UI.
- The probe deliberately did **not** claim UWP AUMID coverage or elevated-process
  control; both were not exercised and are documented as such.

### 2.3 Live monitor (`--monitor --seconds 8 --enforce log`)

```
19:06:09.509  Freebuff  allow  hook=0ms apply=1.0ms  "Freebuff: The free coding agent"
observations: 1, blocked: 0
rows stored: 1
```

SQLite contents: one row, `blocked = 0`, `action = none`, `enforcer_ms = 1.04`.
The event pipeline (WinEvent hook → policy decision → enforcement → SQLite) is
functional. Only one app was foreground during the short run; no synthetic app
switching was injected.

### 2.4 Windows conclusions

| Question | Answer |
|---|---|
| Can a user-mode agent detect foreground app switches quickly? | Yes; event hook + 500 ms fallback. |
| Can it identify UWP apps? | Yes via hosted PID + AUMID resolution (code path present; no Store app foreground during probe). |
| Can it minimize another process's window? | Yes, verified cross-process. |
| Can it terminate a same-user process? | Yes, `PROCESS_TERMINATE` obtained. |
| Can it control elevated/protected apps? | Not claimed; probed non-elevated. |
| Is an unbreakable lock possible? | No. Personal Strict Mode is friction. |
| Driver required? | No, and out of scope. |

## 3. Android agent

### 3.1 What was delivered

A complete PoC module under `apps/android`:

- Kotlin 2.0, Jetpack Compose, Material 3, Room, foreground service,
  UsageStatsManager polling, AccessibilityService with
  `canRetrieveWindowContent=false`, block screen, boot restore, permission UX,
  launcher-only package visibility (no `QUERY_ALL_PACKAGES`).

### 3.2 What could not be verified

**The Android module was not compiled or run.** The machine has no Android SDK,
and the installed JDK 27 is not supported by AGP 8.7/Gradle. Installing a
multi-gigabyte SDK plus a compatible JDK was outside the safe, reversible scope
of this turn. Therefore:

- No APK exists.
- No device test results exist.
- No claim is made that the block screen appears on any device.
- The accessibility background-activity-launch behaviour is **unverified**.

### 3.3 Platform findings (documented, not device-verified)

1. `UsageStatsManager` only observes; it cannot block. It requires a special
   access permission the user can revoke.
2. `AccessibilityService` can detect window changes but Android 10+ restricts
   background activity launches; an overlay (`TYPE_ACCESSIBILITY_OVERLAY`) is the
   likely fallback on strict OEM builds.
3. Google Play requires Accessibility use to be core functionality, disclosed,
   and minimal; `canRetrieveWindowContent=false` is mandatory for this design.
4. Real enforcement on Android requires Device Owner / DPC provisioning
   (`setPackagesSuspended`), i.e. Managed Device Mode — not a personal-phone
   trick.
5. OEM battery managers are the main reliability risk for the foreground service.

## 4. Database and backend rules

### 4.1 Artifacts executed

- `supabase/migrations/20260101000001_init.sql`
- `supabase/migrations/20260101000002_plan_and_reward.sql`
- `scripts/verify-db.mjs` (harness, two users, 34 assertions)

### 4.2 Result: 34 passed, 0 failed

Verified behaviours:

| Area | Evidence |
|---|---|
| Migrations | Both files applied without error |
| Auth trigger | Two profiles + default settings created |
| RLS isolation | User B sees 0 of user A's tasks, rewards |
| RLS writes | User B cannot update user A's task |
| Plan lifecycle | Draft → confirmed → active via RPCs; direct status update refused |
| Committed Must Do | Cannot be deleted by the client; downgrade requires a reason |
| Task completion | Rejected with `0 of 25 required focus minutes` |
| Focus validity | Client-supplied `is_valid` ignored; server computed `true` |
| Grant math | 30 base + 5 bonus = 35 minutes |
| Grant idempotency | Same key and different key both return the original grant |
| Client forgery | Direct insert into `unlock_grants`: permission denied |
| Consumption | 10 of 35 → 25 left; replay does not double-spend |
| Overspend | 30 requested with 25 left → `grant_exhausted` |
| Wallet | 35 earned / 10 consumed / 25 remaining |
| Cross-user RPC | User B cannot evaluate or consume user A's plan/grant |
| Expiry | Expired grant cannot be spent |
| RLS coverage | 38 policies; every public table has RLS enabled |

### 4.3 Not verified

- The migrations have **not** been applied to a hosted Supabase project or via
  `supabase db reset`.
- `supabase/seed.sql` has **not** been executed; it targets real Supabase auth
  columns (`auth.users`, `extensions.crypt`) that the PGlite stub does not have.
- Realtime, Storage and Edge Functions were not exercised (no deployed project).
- PGlite is not a perfect Supabase substitute: auth schema, extensions and
  PostgREST behaviour still need a real `supabase start` pass in Phase 1.

## 5. Bypass register (summary)

| Platform | Bypass | Status |
|---|---|---|
| Windows | Kill agent, rename exe, elevated app, browser tab, second user, safe mode | Documented in `docs/WINDOWS_LOCK.md`; no mitigation claimed beyond watchdog/status |
| Android | Revoke accessibility/usage access, force-stop, OEM battery kill, safe mode, split screen, browser tabs, second profile, root | Documented in `docs/ANDROID_LOCK.md`; permission-loss UX implemented in source |
| Backend | Client forging rewards | Blocked at privilege + trigger + RPC validation; tested |
| Backend | Double spend across devices | Row lock + idempotency; tested sequentially, not under true parallel load |

## 6. Decisions

| Decision | Rationale |
|---|---|
| Proceed with Windows Personal Strict Mode | Primitives verified on real hardware |
| Adopt event hook + polling fallback | Measured 18 ms enumeration, 0–1 ms decision/apply |
| Keep UWP AUMID resolution | Otherwise all Store apps look identical |
| Backend reward authority in SQL, not Edge Functions | Transactions + constraints + RLS give stronger guarantees |
| Android conditional approval | Source is ready; compilation/device validation must happen before Phase 4 |
| No "unbreakable lock" claim | Not true on either platform in personal mode |
| Avoid root/driver/exploit | Legal, policy and stability constraints |

## 7. Residual risks

1. **Android background-launch policy** may require a different presentation per
   OEM. Budget device-matrix work in Phase 1/4.
2. **Windows elevated apps** cannot be controlled without elevation or WDAC;
   product copy must not imply otherwise.
3. **PGlite-only DB verification** may miss Supabase-specific issues (auth
   triggers, grants, PostgREST exposure). Run `supabase db reset` first in Phase 1.
4. **No parallel-load test** for grant/consume concurrency; add a two-connection
   stress test in Phase 3.
5. **Seed data** is unverified until a real Supabase stack is available.

## 8. Reproduce

```bash
# Repository checks
npm install
npm run db:verify                    # 34 assertions
npm run shared:typecheck             # strict TypeScript

# Windows agent
cd apps/windows-agent
dotnet build src/FocusGate.Agent.Poc/FocusGate.Agent.Poc.csproj
dotnet run --project src/FocusGate.Agent.Poc -- --selftest
dotnet run --project src/FocusGate.Agent.Poc -- --monitor --seconds 20 --enforce log

# Android (requires Android Studio / SDK 35 / JDK 17-21)
# open apps/android in Android Studio, then run the manual test script in
# apps/android/README.md
```

## 9. Go / no-go

- **Windows:** GO for Phase 1 skeleton and Phase 4 enforcement.
- **Android:** CONDITIONAL GO — must compile, install and pass the device matrix
  before any blocking behaviour is promised to users.
- **Backend:** GO for Phase 1 against a real Supabase stack; the reward model is
  already enforced and tested.

No Phase 1 product code has been started, per the Phase 0 gate in the brief.
