# FocusGate – Milestone 1 Test & Verification Report

Date: 2026-11-22  
Branch: `main` (based on commit `894c183` + preserved user uncommitted changes)

> **Important distinction:** Build and automated unit-test success does **not**
> prove real-device App Lock reliability on a physical phone. Automated checks
> and physical-device tests are reported separately below.

## 1. Automated Build & Test Summary

| Component | Command | Result | Details |
|---|---|---|---|
| Android (`personalDebug` + `managedDebug` + Unit Tests) | `.\gradlew.bat --no-daemon :app:assemblePersonalDebug :app:assembleManagedDebug :app:testPersonalDebugUnitTest :app:testManagedDebugUnitTest` (JDK 17, SDK 36) | **PASS** | `BUILD SUCCESSFUL in 40s`; both APKs built; **22/22 unit tests passed per flavor** (44 total: `PolicyEvaluatorTest` 10, `ProtectionEvaluatorTest` 9, `EmergencyAccessTest` 3) |
| Windows Agent Build | `dotnet build --no-incremental` (.NET 10.0.400) | **PASS** | `0 Warning(s), 0 Error(s)` (`Nullable=enable`, `TreatWarningsAsErrors=true`) |
| Windows Agent `--selftest` | `FocusGate.Agent.Poc.exe --selftest` | **PASS (headless)** | `5 passed, 0 failed, 3 skipped`, exit code `0` (foreground/UWP skipped because shell session has no foreground window; elevation skipped by design) |
| Windows Agent Error Handling | `--policy` missing / `--db` unwritable directory | **PASS** | Both exit cleanly with code `2` and explicit error messages |
| Windows Agent `--monitor` (`log`, `minimize`, `overlay`, `terminate`) | `--monitor --seconds 3 --enforce <mode>` | **PARTIAL (headless)** | All 4 modes start and exit `0` cleanly, but `observations: 0` in non-interactive shell; interactive desktop foreground switching not exercised in this run |
| Database Verification | `npm ci` + `npm run db:verify` | **PASS** | **74 passed, 0 failed** across all 3 migrations on PGlite (includes 4 new multi-device assertions) |
| Web Local Seed Check | `node scripts/verify-local-seed.mjs` | **PASS** | **8/8 checks passed** (`Local workspace OK`) |
| Workspace Typecheck | `npm run typecheck` | **PASS** | `0` TypeScript errors across `@focusgate/web` and `@focusgate/shared-contracts` |
| Web Production Build | `npm run build -w @focusgate/web` | **PASS** | Next.js 15.5.29 production build succeeded (`/` + 5 app routes) |
| Web HTTP Smoke Test | `next start -p 3001` + `Invoke-WebRequest` on 6 routes | **PASS** | `/`, `/tasks`, `/planner`, `/focus`, `/wallet`, `/statistics` all returned `HTTP 200` |

## 2. Detailed Component Verification

### 2.1 Android Stabilization & Architecture Check
- **Verified Architecture:** `UsageStatsManager.queryEvents` (1 s poll) + `SYSTEM_ALERT_WINDOW` (`TYPE_APPLICATION_OVERLAY` ComposeView) + `specialUse` Foreground Service (`AppUsageMonitorService`). **No `AccessibilityService`** and **no `BlockedActivity`**.
- **Personal Strict Mode Logic Checked (code + unit tests):**
  - Missing Usage Access or Overlay Permission → `ProtectionEvaluator` reports `DEGRADED`, overlay hides, `Notifications.notifyProtectionLost` fires.
  - Service stopped by OS → `ProtectionEvaluator` reports `DEGRADED` (`Monitoring service is not running`), `ProtectionWatchdogWorker` alerts periodically.
  - Screen off / Keyguard locked → `AppUsageMonitorService` pauses overlay and closes open usage event; `resyncForeground` runs on unlock.
  - Reboot → `BootReceiver` clears expired/rebooted emergency access and restarts service (or re-applies Managed policy).
  - Emergency Unlock → bounded (default 10 min, max 15 min) using `elapsedRealtime` + `BOOT_COUNT`; status shows `DEGRADED`.
  - Essential apps protection → expanded static OEM allowlist (Xiaomi MIUI/HyperOS, Samsung, Google dialer/safetyhub) + runtime `SystemPackages.deviceEssential(context)` (default launcher, dialer, SMS) so system/emergency apps are never blocked.
  - Exit transition hardening → added 2 s suppression window after `goHome()` / `openFocusGate()` to prevent overlay re-flash while launcher resumes.
- **Managed Device Mode Checked (code + unit tests):**
  - `ManagedDeviceController` isolates `DevicePolicyManager` (`setPackagesSuspended`, `setLockTaskPackages`) in the `managed` flavor; `personal` flavor ships a stub.
  - Partial suspension failures now degrade `ProtectionEvaluator` status (`DEGRADED` with unsuspended count) instead of falsely showing `PROTECTED`.
  - Device Owner provisioning was **not** executed on any personal device.

### 2.2 Windows Agent Stabilization & Maturity Assessment
- **Maturity Stage:** **Windows PoC** (not yet Prototype or Production). Missing: system tray app, autostart/watchdog scheduled task, DPAPI token store, device registration, backend policy sync, MSIX/installer.
- **Fix Applied:** `SelfTest.CheckUwpIdentity()` now returns `Skip` (matching `CheckForegroundWindow()`) when `GetForegroundWindow()` is `IntPtr.Zero`, eliminating the false failure in locked/non-interactive sessions.
- **Safety:** `Terminate` was only tested against project-owned `--window-probe`; no user browser, IDE, Explorer, or system process was touched.

### 2.3 Database Verification (74 Assertions)
All 3 migrations (`20260101000001_init.sql`, `20260101000002_plan_and_reward.sql`, `20260101000003_backend_hardening.sql`) passed cleanly. Added 4 regression assertions in `scripts/verify-db.mjs` for multi-device behavior:
1. Second active device (`Alice Android`) calling `rpc_evaluate_unlock` on the same completed plan returns the existing grant (`idempotent: true`) without duplicating ledger rows.
2. Second device replaying first device's `consume-key-0001` is rejected with `idempotency_conflict`.
3. Second device consuming 5 minutes decrements the shared grant from 25 → 20 minutes.
4. First device subsequently requesting 21 minutes is rejected with `grant_exhausted`.

### 2.4 Web Dashboard (6 Screens)
- Verified `/`, `/tasks`, `/planner`, `/focus`, `/wallet`, `/statistics` build cleanly and return `HTTP 200` on `next start`.
- Verified server actions (`tasks.ts`, `planner.ts`, `focus.ts`, `rewards.ts`) use Zod schemas (`validation.ts`), surface DB errors via `friendlyDbError`, and call `revalidateWorkspace()`.
- Confirmed `loading.tsx` skeletons exist for all 6 routes and `app/(app)/error.tsx` handles runtime errors.
- Confirmed `apps/web/lib/db/index.ts` (`PGlite` + `LOCAL_USER_ID`) is strictly a local development data layer and **not** production authentication.

## 3. Unverified / Pending Tests (Disclosed Explicitly)

1. **Physical Android Device Testing (Redmi Note 13 / Android 15 / HyperOS):**
   - `adb devices -l` detected `0` connected devices during Milestone 1.
   - Real-device overlay latency, screen lock/unlock, reboot `BOOT_COMPLETED` FGS start, and Xiaomi HyperOS battery/autostart behavior are **NOT VERIFIED**.
2. **Windows Interactive Desktop Enforcement Test:**
   - Visual verification of `BlockOverlayForm` and live `terminate` against `--window-probe` while foregrounded requires an interactive desktop session (not headless shell).
   - UWP Store app AUMID resolution (`CheckUwpIdentity`) remains `SKIP` until a Store app is foregrounded.
3. **Real Supabase Stack & Concurrency:**
   - `supabase start` / `supabase db reset` + `supabase/seed.sql` have **not** been executed (Docker daemon not running; no Supabase project credentials).
   - True parallel multi-connection concurrency test on `rpc_consume_unlock_minutes` is pending real PostgreSQL (PGlite serializes on a single connection).
4. **Web Interactive Browser E2E:**
   - Automated browser click-through of forms/timers/toasts was not run; verified via SSR HTTP 200 smoke test, Zod/action code review, and local seed verification.

## 4. Manual Test Guide for Physical Device (Redmi Note 13 – Android 15 / HyperOS)

> **Safety:** Do **not** factory-reset the personal phone and do **not** run `dpm set-device-owner` on a personal phone. Test the `personal` flavor only.

### Prerequisites
1. On Redmi Note 13: enable **Developer options** → **USB debugging** (and **Install via USB** if prompted by HyperOS).
2. Connect via USB and verify:
   ```powershell
   .\.android-tools\sdk\platform-tools\adb.exe devices -l
   .\.android-tools\sdk\platform-tools\adb.exe shell getprop ro.build.version.release
   ```
3. Install the `personalDebug` APK (only after user confirmation):
   ```powershell
   .\.android-tools\sdk\platform-tools\adb.exe install -r apps\android\app\build\outputs\apk\personal\debug\app-personal-debug.apk
   ```

### Test Checklist (Record Pass/Fail & Latency)

| # | Scenario | Expected Behavior | Status |
|---|---|---|---|
| 1 | Onboarding without permissions | Status shows `Off` / `Not granted`; cannot enable monitoring until Usage Access and Overlay are granted | [ ] Pending |
| 2 | Grant Usage Access only (no Overlay) | Status shows `Degraded` / blocks enabling protection | [ ] Pending |
| 3 | Grant both Usage Access + Display over other apps (+ HyperOS "Display pop-up windows while running in the background" if required) | Both show `Granted`; enabling monitoring starts foreground notification and status becomes `Protected` | [ ] Pending |
| 4 | Select 1 entertainment app (e.g. YouTube) and tap **Save policy** | Essential apps (Phone, Messages, Settings, Launcher) are not selectable; policy persists | [ ] Pending |
| 5 | Open the restricted app | Full-screen FocusGate overlay appears; measure latency from tap to overlay visible (target ~1 s) | [ ] Pending |
| 6 | Tap **Back home** / **Open FocusGate** on overlay | Overlay hides cleanly without re-flashing; returns to launcher or FocusGate | [ ] Pending |
| 7 | Revoke Usage Access in Settings | Overlay hides, "Protection lost" notification appears, Home shows `Degraded` | [ ] Pending |
| 8 | Revoke Overlay permission in Settings | "Protection lost" notification appears, Home shows `Degraded` | [ ] Pending |
| 9 | Lock screen while on restricted app, then unlock | Overlay hides on lock and re-applies cleanly after unlock | [ ] Pending |
| 10 | Trigger 10-min Emergency Unlock from overlay | Overlay hides, target app usable, Home shows `Degraded` + countdown; ending emergency re-arms block | [ ] Pending |
| 11 | Reboot phone (with HyperOS Autostart enabled) | `BootReceiver` restarts `AppUsageMonitorService` (or notifies if HyperOS blocks `BOOT_COMPLETED` FGS start) | [ ] Pending |
| 12 | Force-stop FocusGate from App Info | Home reflects `Degraded` ("Monitoring service is not running") on next open — never claims `Protected` | [ ] Pending |

## 5. Definition of Done (Milestone 1)

- [x] Repository không bị mất dữ liệu hoặc thay đổi của người dùng.
- [x] Android Personal build thành công (`app-personal-debug.apk`).
- [x] Android Managed build thành công (`app-managed-debug.apk`).
- [x] Android Unit Tests thành công (22/22 mỗi flavor, 44/44 tổng).
- [x] Windows Agent build thành công (0 warning, 0 error).
- [x] Windows SelfTest không có lỗi chưa xử lý (5 pass, 0 fail, 3 skip, exit 0).
- [x] Database verification thành công (74/74 assertions trên PGlite).
- [x] Web TypeScript typecheck thành công.
- [x] Web production build thành công (và 6/6 route trả về HTTP 200).
- [x] Tài liệu khớp với source code.
- [x] Những kiểm thử chưa thực hiện được (thiết bị thật Redmi Note 13, interactive Windows desktop, real Supabase stack) được công khai rõ ràng.
