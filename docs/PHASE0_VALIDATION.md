# Phase 0 – Technical Validation Report

Date: 2026-11-21 (updated 2026-11-22 in Milestone 1) · Status: **complete, conditional go**

Scope: verify what Android, Windows and PostgreSQL actually allow before building
the product. Nothing in this report is inferred from documentation alone where a
local measurement was possible. For the full Milestone 1 verification log see
`docs/MILESTONE1_TEST_REPORT.md`.

## 1. Environment

| Item | Value |
|---|---|
| Workspace | `C:\Users\hungv\Downloads\focusgate` |
| OS | Windows 11, build 10.0.26300 |
| .NET SDK | 10.0.400 |
| Node / npm | 24.17.0 / 12.0.1 |
| Java (local toolchain) | JDK 17 under `.android-tools/jdk17` (system JDK 27 is outside AGP 8.13 support matrix) |
| Android SDK (local toolchain) | `.android-tools/sdk` (Platforms 35 & 36, Build Tools 35.0.0 & 36.0.0, `platform-tools`, `emulator`) |
| Physical Android device | **None attached via ADB** (Redmi Note 13 / Android 15 testing pending) |
| Docker | CLI present, **daemon not running**; Postgres container could not be used |
| PostgreSQL client | not installed |
| Supabase CLI / hosted project | not available in this environment |
| Git | `main` tracking `origin/main` |

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

A compiled and unit-tested module under `apps/android` with two product flavors:

- **Personal flavor (`com.focusgate.app`):** Kotlin 2.0.21, Jetpack Compose,
  Material 3, Room, `specialUse` foreground service (`AppUsageMonitorService`),
  `UsageStatsManager.queryEvents` polling (1 s), `TYPE_APPLICATION_OVERLAY`
  full-screen Compose block overlay (`BlockOverlayController`), dynamic
  default-app essential protection (`SystemPackages`), bounded `EmergencyAccess`,
  `BootReceiver`, `ProtectionWatchdog`, and launcher-only package visibility
  (no `QUERY_ALL_PACKAGES`). **No `AccessibilityService` is used.**
- **Managed flavor (`com.focusgate.app.managed`):** Device Owner
  `DevicePolicyManager.setPackagesSuspended` (`ManagedDeviceController`) and
  optional `setLockTaskPackages` allowlist for provisioned devices.

### 3.2 What was verified vs. not verified

- **Verified (automated + API 36 emulator):**
  - `assemblePersonalDebug` and `assembleManagedDebug` build cleanly with JDK 17
    + Android SDK 36 / Build Tools 36.0.0.
  - `testPersonalDebugUnitTest`: **38/38 passed** (`ManagedSuspensionReconcilerTest` 10,
    `PolicyEvaluatorTest` 13, `ProtectionEvaluatorTest` 12, `EmergencyAccessTest` 3).
  - `testManagedDebugUnitTest`: **38/38 passed** (76 total across both flavors).
  - API 36 emulator walkthrough documented in `docs/ANDROID_LOCK.md`.
- **Not verified:**
  - **Physical device testing** (target: Redmi Note 13 / Android 15 HyperOS) has
    not been run because no phone was connected via ADB.
  - OEM autostart/battery killers, background FGS start from `BOOT_COMPLETED` on
    HyperOS, release signing, and Play Console review are unverified.

### 3.3 Platform findings

1. `UsageStatsManager` only observes; it cannot block. It requires a special
   access permission the user can revoke.
2. `SYSTEM_ALERT_WINDOW` (`TYPE_APPLICATION_OVERLAY`) avoids background activity
   launch restrictions and Google Play's AccessibilityService restriction, but
   remains user-revocable friction.
3. Real enforcement on Android requires Device Owner / DPC provisioning
   (`setPackagesSuspended`), i.e. Managed Device Mode — not a personal-phone
   trick.
4. OEM battery managers (especially Xiaomi HyperOS/MIUI) are the main
   reliability risk for the foreground service.

## 4. Database and backend rules

### 4.1 Artifacts executed

- `supabase/migrations/20260101000001_init.sql`
- `supabase/migrations/20260101000002_plan_and_reward.sql`
- `supabase/migrations/20260101000003_backend_hardening.sql`
- `scripts/verify-db.mjs` (harness, two users + multiple devices, **74 assertions**)

### 4.2 Result: 74 passed, 0 failed

Verified behaviours:

| Area | Evidence |
|---|---|
| Migrations | All 3 migration files applied without error |
| Auth trigger & profile validation | Display name truncation/fallback, unknown timezone rejected, blank name rejected |
| RLS isolation | User B sees 0 of user A's tasks, focus sessions, grants, ledger |
| RLS writes | User B cannot update user A's task |
| Plan lifecycle | Draft → confirmed → active → completed via RPCs; direct status update refused |
| Committed Must Do | Cannot be deleted by the client; downgrade requires a reason |
| Task completion | Rejected with `0 of 25 required focus minutes`; succeeds once valid focus exists |
| Focus sessions | Server-owned RPCs; single open session unique index; direct insert/update revoked; server clock elapsed calculation |
| Grant math & idempotency | 30 base + 5 bonus = 35 minutes; same/different key returns original grant; key reuse across plans rejected |
| Client forgery | Direct insert into `unlock_grants` / `user_settings` update: permission denied |
| Consumption & multi-device | 10 of 35 → 25 left; replay idempotent; second device cannot claim duplicate grant or replay first device's key; second device spends 5 → 20 left; overspend rejected (`grant_exhausted`) |
| Device revocation | Revoking a device cancels open sessions and blocks subsequent session start / spending |
| Cross-tenant storage constraints | Composite `(id, user_id)` FKs and usage event grant ownership trigger reject cross-user references |
| Expiry | Expired grant cannot be spent |
| RLS coverage | 33 policies; every public table has RLS enabled |

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
| Android | Revoke usage/overlay access, force-stop, OEM battery kill, safe mode, split screen, browser tabs, second profile, root | Documented in `docs/ANDROID_LOCK.md`; permission-loss UX implemented and unit-tested; physical device pending |
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
npm ci
npm run db:verify                    # 74 assertions
npm run typecheck                    # strict TypeScript
npm run build -w @focusgate/web

# Windows agent
cd apps/windows-agent
dotnet build src/FocusGate.Agent.Poc/FocusGate.Agent.Poc.csproj
dotnet run --project src/FocusGate.Agent.Poc -- --selftest
dotnet run --project src/FocusGate.Agent.Poc -- --monitor --seconds 20 --enforce log

# Android (requires JDK 17 + Android SDK 36 / Build Tools 36.0.0)
cd apps/android
./gradlew :app:assemblePersonalDebug :app:assembleManagedDebug \
  :app:testPersonalDebugUnitTest :app:testManagedDebugUnitTest
```

## 9. Go / no-go

- **Windows:** GO for Phase 1 skeleton and Phase 4 enforcement.
- **Android:** CONDITIONAL GO — must compile, install and pass the device matrix
  before any blocking behaviour is promised to users.
- **Backend:** GO for Phase 1 against a real Supabase stack; the reward model is
  already enforced and tested.

No Phase 1 product code has been started, per the Phase 0 gate in the brief.
