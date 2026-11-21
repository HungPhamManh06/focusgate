# FocusGate – Milestone 1 Initial Audit

Date: 2026-11-22  
Branch: `main` (tracking `origin/main`)  
Latest commit at audit time: `894c183` (`feat: initial commit for FocusGate project`)

## 1. Repository State at Audit Start

- **Tracked files:** 156 files.
- **Uncommitted user changes preserved (not overwritten or reverted):**
  - `apps/android/README.md`
  - `apps/android/app/src/main/java/com/focusgate/app/service/BlockOverlayController.kt`
  - `apps/android/app/src/main/java/com/focusgate/app/ui/OnboardingScreen.kt`
  - `apps/android/app/src/managed/java/com/focusgate/app/admin/ManagedDeviceController.kt`
  - `docs/ANDROID_LOCK.md`
- **Local toolchain present (git-ignored under `.android-tools/`):**
  - JDK 17 (`.android-tools/jdk17`)
  - Android SDK with Platforms 35 & 36, Build Tools 35.0.0 & 36.0.0, `platform-tools` (`adb.exe`), `emulator`, `system-images/android-36`
  - System `.NET SDK`: `10.0.400`, `Node.js`: `v24.17.0`, `npm`: `12.0.1`
  - Physical Android device: **none attached** (`adb devices -l` returned empty list).

## 2. What Already Exists

### 2.1 Android (`apps/android/`)
- Kotlin 2.0.21 + Jetpack Compose (Material 3) + Room + WorkManager + Coroutines.
- Two product flavors (`deployment` dimension):
  - `personal` (`com.focusgate.app`): Usage Access + `TYPE_APPLICATION_OVERLAY` full-screen Compose overlay + `specialUse` Foreground Service (`AppUsageMonitorService`).
  - `managed` (`com.focusgate.app.managed`): Device Owner (`FocusGateDeviceAdminReceiver`, `ManagedDeviceController`) using `DevicePolicyManager.setPackagesSuspended` + optional `setLockTaskPackages`.
- **Actual architecture in source:** **No `AccessibilityService` and no `BlockedActivity`**. Foreground detection uses `UsageStatsManager.queryEvents` polled every 1 s; blocking uses `WindowManager.addView` with `TYPE_APPLICATION_OVERLAY`.
- Policy & status evaluators (`PolicyEvaluator`, `ProtectionEvaluator`), bounded `EmergencyAccess` (`elapsedRealtime` + `BOOT_COUNT`), `BootReceiver`, `EmergencyExpiryReceiver`, `ProtectionWatchdog`, and unit tests.

### 2.2 Windows Agent (`apps/windows-agent/`)
- .NET 10 WinForms/CLI PoC (`FocusGate.Agent.Poc`, `Nullable=enable`, `TreatWarningsAsErrors=true`).
- Event-driven foreground monitor (`SetWinEventHook(EVENT_SYSTEM_FOREGROUND)`) + 500 ms polling fallback.
- UWP `ApplicationFrameHost` hosted-PID + AUMID resolution (`WindowInspector`).
- Pure `EnforcementEngine` with mandatory allowlist precedence.
- Four enforcement actions: `log`, `minimize`, `overlay` (`BlockOverlayForm`), `terminate` (with `pid <= 4` refusal guard).
- Local SQLite WAL event store (`Microsoft.Data.Sqlite 10.0.15`, fixing `GHSA-2m69-gcr7-jv3q`) and `--selftest` capability probe.

### 2.3 Database & Migrations (`supabase/migrations/`)
- Three migrations:
  1. `20260101000001_init.sql` (core schema, RLS policies, reward write guard)
  2. `20260101000002_plan_and_reward.sql` (plan lifecycle RPCs, unlock grant & consumption RPCs, device revocation)
  3. `20260101000003_backend_hardening.sql` (server-owned focus sessions, composite `(id, user_id)` foreign keys, advisory locks, cross-tenant usage event guard)
- `scripts/verify-db.mjs` running against PGlite (70 automated assertions at audit time).

### 2.4 Web Dashboard (`apps/web/`)
- Next.js 15.5 App Router + React 19 + TypeScript strict + Tailwind v4 + Zod.
- 6 implemented screens: Dashboard (`/`), Tasks (`/tasks`), Daily Planner (`/planner`), Focus (`/focus`), Reward Wallet (`/wallet`), Statistics (`/statistics`).
- Server Actions backed by local PGlite (`apps/web/lib/db/index.ts`) using `LOCAL_USER_ID` and real PostgreSQL migrations + RLS.
- Loading skeletons (`loading.tsx`), error boundary (`error.tsx`), empty states, and responsive sidebar/mobile navigation.

## 3. What Is Missing (Out of Scope or Deferred Beyond Phase 0)

- **Physical Android device testing** on Redmi Note 13 / Android 15 (no device connected via ADB during audit).
- **Windows Agent production components:** system tray UI, autostart/watchdog task, DPAPI credential storage, device registration, backend policy sync, MSIX/installer.
- **Android production components:** backend sync, Keystore credentials, Play Console declarations, release signing, EMM/DPC QR provisioning flow.
- **Real Supabase stack & Auth:** `supabase start` / `supabase db reset`, real Auth session replacing `LOCAL_USER_ID`, hosted deployment.
- **True parallel multi-connection concurrency stress test** for reward grant/consumption (PGlite is single-connection serialized).

## 4. Issues Identified During Audit

1. **Documentation drift vs. actual codebase:**
   - `README.md`, `docs/PHASE0_VALIDATION.md`, and `docs/DEVELOPMENT_ROADMAP.md` still claim Android is "not compiled / no Android SDK / JDK 27", describe `AccessibilityService`, and cite outdated DB assertion counts (`34` in `PHASE0_VALIDATION.md` and `DEVELOPMENT_ROADMAP.md` vs. `70` in `README.md` / `verify-db.mjs`).
2. **Android essential package protection gaps (OEM compatibility):**
   - `PolicyEvaluator.ESSENTIAL_PACKAGES` missed common OEM/Google packages (e.g. `com.google.android.dialer`, `com.android.phone`, `com.miui.securitycenter`, `com.miui.home`, `com.samsung.android.dialer`, `com.google.android.apps.safetyhub`) and did not dynamically resolve the device's default launcher, dialer, or SMS app.
3. **Android overlay re-flash race on exit:**
   - In `AppUsageMonitorService`, clicking "Back home" or "Open FocusGate" hid the overlay without briefly suppressing re-display while the OS transitions foreground events, risking an overlay flash on slower devices.
4. **Android Managed Mode partial-failure status reporting:**
   - `HomeScreen` / `ProtectionEvaluator` reported `PROTECTED` in Managed Mode even if `DevicePolicyManager.setPackagesSuspended` failed to suspend one or more restricted packages.
5. **Windows Agent `--selftest` false failure in locked/non-interactive sessions:**
   - `SelfTest.CheckForegroundWindow()` returned `Skip` when `GetForegroundWindow() == IntPtr.Zero`, but `SelfTest.CheckUwpIdentity()` returned `Fail` ("Could not resolve the foreground window"), causing `--selftest` to exit with code 1 in headless/locked sessions.
6. **Database multi-device verification gap:**
   - `scripts/verify-db.mjs` tested single-device grant/consume and device revocation, but lacked explicit assertions for two active devices of the same user attempting to claim a duplicate grant, replay each other's consume idempotency key, or overspend a shared grant balance.

## 5. Files Planned for Stabilization

- **Android:**
  - `apps/android/app/src/main/java/com/focusgate/app/util/SystemPackages.kt` (new)
  - `apps/android/app/src/main/AndroidManifest.xml` (add `CATEGORY_HOME` query)
  - `apps/android/app/src/main/java/com/focusgate/app/policy/PolicyEvaluator.kt`
  - `apps/android/app/src/main/java/com/focusgate/app/policy/ProtectionEvaluator.kt`
  - `apps/android/app/src/main/java/com/focusgate/app/service/AppUsageMonitorService.kt`
  - `apps/android/app/src/managed/java/com/focusgate/app/admin/ManagedDeviceController.kt`
  - `apps/android/app/src/personal/java/com/focusgate/app/admin/ManagedDeviceController.kt`
  - `apps/android/app/src/main/java/com/focusgate/app/ui/AppCatalog.kt`
  - `apps/android/app/src/main/java/com/focusgate/app/ui/HomeScreen.kt`
  - `apps/android/app/src/test/java/com/focusgate/app/policy/PolicyEvaluatorTest.kt`
  - `apps/android/app/src/test/java/com/focusgate/app/policy/ProtectionEvaluatorTest.kt`
- **Windows Agent:**
  - `apps/windows-agent/src/FocusGate.Agent.Poc/Services/SelfTest.cs`
- **Database Verification:**
  - `scripts/verify-db.mjs`
- **Documentation:**
  - `README.md`
  - `docs/PHASE0_VALIDATION.md`
  - `docs/ANDROID_LOCK.md`
  - `docs/WINDOWS_LOCK.md`
  - `docs/DEVELOPMENT_ROADMAP.md`
  - `docs/MILESTONE1_TEST_REPORT.md` (new)

## 6. Deployment & Stabilization Risks

- **Xiaomi HyperOS / Android 15 OEM restrictions:** MIUI/HyperOS aggressively kills foreground services and restricts `BOOT_COMPLETED` FGS starts and `SYSTEM_ALERT_WINDOW` overlays unless Autostart and "No restrictions" battery mode are enabled. Emulator tests cannot substitute for Redmi Note 13 physical-device testing.
- **PGlite vs. real Supabase:** PGlite validates PostgreSQL SQL/RLS/RPC semantics, but does not validate Supabase Auth (`auth.users` extensions), PostgREST exposure, or true concurrent multi-connection transactions.
- **Local Web Auth (`LOCAL_USER_ID`):** `apps/web/lib/db/index.ts` hardcodes a single local user for development. It must never be deployed as production authentication.
- **Windows interactive vs. headless testing:** Live foreground switching, visual overlay dismissal, and cross-process terminate against a foreground window require an interactive desktop session.
