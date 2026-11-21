# FocusGate – Milestone 1.1 Bug Fix & Acceptance Hardening Report

Date: 2026-11-22  
Base commit: `8a8f28f2a9e0565a476fb50f23d6fe64a3a9a327`  
Branch: `main`

> **Honesty notice:** All automated builds and JVM/PGlite/Windows-PoC tests
> below were actually executed and passed. **Physical-device testing on Redmi
> Note 13 (Android 15 / HyperOS) has NOT been performed** (no device attached
> via ADB). Build and unit-test success does not substitute for real-device
> validation.

## 1. Bugs Fixed

### 1.1 Managed Mode Suspend/Unsuspend Failure Tracking (`ManagedDeviceController` / `ManagedSuspensionReconciler`)
- **Root cause:** `ManagedDeviceController.applyBlockedPackages()` previously merged suspend and unsuspend failures into a single `failures` list and computed `currentlySuspended - toUnsuspend`, silently dropping any package that **failed to unsuspend** from local tracking.
- **Fix:**
  - Extracted pure reconciliation logic into `ManagedSuspensionReconciler` (`apps/android/app/src/main/java/com/focusgate/app/admin/ManagedSuspensionReconciler.kt`) with a testable `ManagedSuspensionBackend` interface.
  - Added `failedToSuspend` and `failedToUnsuspend` fields to `ManagedApplyResult`.
  - Only removes packages from tracked suspended state when unsuspend succeeds (`toUnsuspend - failedToUnsuspend`).
  - Failed-to-suspend packages are never recorded as suspended (`toSuspend - failedToSuspend`).
  - Failed-to-unsuspend packages remain tracked so `clearSuspensions()` and subsequent retries recover them.
  - Reconciles tracked state against actual OS state via `DevicePolicyManager.isPackageSuspended(admin, pkg)` (handling `NameNotFoundException` and `SecurityException`).
  - Handles `SecurityException` in both `applyBlockedPackages()` and `clearSuspensions()` without losing tracked suspended packages, and never returns `applied = true` if any package failed.

### 1.2 Protection Status vs. Unsaved Policy (`HomeScreen` & `ProtectionEvaluator`)
- **Root cause:** `HomeScreen.kt` previously evaluated `ProtectionEvaluator` against the mutable UI selection (`blocked`/`exempt`) and forced `managedUnsuspended = 0` when `dirty = true`. Selecting an app without saving could falsely display `Protected`.
- **Fix:**
  - Split UI state strictly into `savedBlocked`/`savedExempt` (persisted/applied policy) and `pendingBlocked`/`pendingExempt` (unsaved edits).
  - Derived `hasUnsavedChanges = pendingBlocked != savedBlocked || pendingExempt != savedExempt`.
  - `ProtectionEvaluator.evaluate(...)` now evaluates **only** `savedEffectiveBlocked` (never pending edits) and surfaces `hasUnsavedChanges` in `ProtectionSnapshot` and inside the Protection status card (`"Unsaved changes — active protection still uses the last saved policy."`).
  - Wrapped Room persistence in `savePolicy()` with `runCatching`; if saving fails, `savedBlocked`/`savedExempt` remain unchanged and active status never claims `Protected` for unsaved edits.
  - Exposed `AppUsageMonitorService.appliedBlockedPackages` and `appliedExemptPackages` so Personal Mode distinguishes saved policy from what the running foreground service has loaded (`monitorPolicySynced`).
  - Managed Mode partial suspension failures (`managedUnsuspended > 0`) always report `ProtectionLevel.DEGRADED`.

### 1.3 Dynamic Essential Package Safety (`SystemPackages`, `PolicyEvaluator`, `AppUsageMonitorService`, `HomeScreen`)
- **Root cause:** `HomeScreen` cached `SystemPackages.deviceEssential(context)` once via `remember { ... }`, so changing default launcher/dialer/SMS in Android Settings while the app stayed in memory did not update protection or the app picker. Also, blank/whitespace package names were not filtered in `PolicyEvaluator`.
- **Fix:**
  - `HomeScreen.refreshRuntime()` (triggered on `ON_RESUME`) now refreshes `deviceEssential` and reloads `loadLauncherApps(context)` if defaults changed.
  - `AppUsageMonitorService` refreshes `deviceEssential` on startup, on policy reload (`applyRules`), on screen unlock (`resyncForeground`), and every 60 s in `pollUsage`.
  - `PolicyEvaluator` trims and ignores blank/malformed package entries so invalid policy data can never trigger a block.

### 1.4 Documentation Synchronization
- Unified the actual Android unit test count across `README.md`, `apps/android/README.md` (previously stale `17/17`), `docs/ANDROID_LOCK.md`, `docs/PHASE0_VALIDATION.md`, `docs/DEVELOPMENT_ROADMAP.md`, and `docs/MILESTONE1_TEST_REPORT.md` to match the real Gradle JUnit output (**38/38 per flavor**).

## 2. Files Changed

- **New:**
  - `apps/android/app/src/main/java/com/focusgate/app/admin/ManagedSuspensionReconciler.kt`
  - `apps/android/app/src/test/java/com/focusgate/app/admin/ManagedSuspensionReconcilerTest.kt`
  - `docs/MILESTONE1_1_TEST_REPORT.md`
- **Modified:**
  - `apps/android/app/src/main/java/com/focusgate/app/admin/ManagedApplyResult.kt`
  - `apps/android/app/src/managed/java/com/focusgate/app/admin/ManagedDeviceController.kt`
  - `apps/android/app/src/main/java/com/focusgate/app/policy/PolicyEvaluator.kt`
  - `apps/android/app/src/main/java/com/focusgate/app/policy/ProtectionEvaluator.kt`
  - `apps/android/app/src/main/java/com/focusgate/app/service/AppUsageMonitorService.kt`
  - `apps/android/app/src/main/java/com/focusgate/app/ui/HomeScreen.kt`
  - `apps/android/app/src/test/java/com/focusgate/app/policy/PolicyEvaluatorTest.kt`
  - `apps/android/app/src/test/java/com/focusgate/app/policy/ProtectionEvaluatorTest.kt`
  - `README.md`
  - `apps/android/README.md`
  - `docs/ANDROID_LOCK.md`
  - `docs/PHASE0_VALIDATION.md`
  - `docs/DEVELOPMENT_ROADMAP.md`
  - `docs/MILESTONE1_TEST_REPORT.md`

## 3. New Unit Tests Added (+16 per flavor, 38/38 total per flavor)

| Test Suite | Count | New Tests in Milestone 1.1 |
|---|---|---|
| `ManagedSuspensionReconcilerTest` (NEW) | **10** | Not Device Owner; full suspend success; failed suspend excluded from tracking; failed unsuspend retained in tracking; combined suspend + unsuspend failure separation; `SecurityException` on apply; `clearSuspensions` partial failure + retry recovery; `SecurityException` on clear; OS state reconciliation (`isPackageSuspended`); essential/exempt/own package protection |
| `PolicyEvaluatorTest` | **13** (+3) | System UI / Permission Controller / Emergency apps always protected; dynamic update when default SMS/dialer/launcher changes; blank/malformed policy entries ignored |
| `ProtectionEvaluatorTest` | **12** (+3) | Unsaved pending selection with empty saved policy stays `OFF` (never `PROTECTED`); `hasUnsavedChanges` surfaced while reflecting saved policy; Personal Mode `DEGRADED` when monitor service policy is out of sync |
| `EmergencyAccessTest` | **3** | Existing bounded emergency window & boot-count tests |
| **Total per flavor** | **38** | **76/76 executed across `personalDebug` and `managedDebug`** |

## 4. Build & Test Results

| Command | Result | Exact Observed Output |
|---|---|---|
| `.\gradlew.bat --no-daemon :app:testPersonalDebugUnitTest :app:testManagedDebugUnitTest :app:assemblePersonalDebug :app:assembleManagedDebug` (JDK 17, SDK 36) | **PASS** | `BUILD SUCCESSFUL in 47s`; `testPersonalDebugUnitTest` **38/38 passed** (0 fail, 0 err, 0 skip); `testManagedDebugUnitTest` **38/38 passed** (0 fail, 0 err, 0 skip); both debug APKs assembled |
| `npm run db:verify` | **PASS** | **74 passed, 0 failed** across all 3 migrations on PGlite |
| `npm run typecheck` | **PASS** | `0` TypeScript errors across all workspaces |
| `npm run build -w @focusgate/web` | **PASS** | Next.js 15.5.29 production build succeeded |
| `dotnet build --no-incremental` (in `apps/windows-agent`) | **PASS** | `0 Warning(s), 0 Error(s)` (`Time Elapsed 00:00:04.13`) |
| `dotnet run --project src/FocusGate.Agent.Poc -- --selftest` | **PASS** | `5 passed, 0 failed, 3 skipped`, exit code `0` |

## 5. Security & Failure Scenarios Coverage

| Scenario | Verified By | Result |
|---|---|---|
| User revokes Usage Access | `ProtectionEvaluatorTest` + `AppUsageMonitorService` | Reports `DEGRADED`, hides overlay, notifies |
| User revokes Overlay Permission | `ProtectionEvaluatorTest` + `AppUsageMonitorService` | Reports `DEGRADED`, hides overlay, notifies |
| `DevicePolicyManager` fails to suspend package | `ManagedSuspensionReconcilerTest` + `ProtectionEvaluatorTest` | `applied=false`, excluded from tracked set, UI shows `DEGRADED` |
| `DevicePolicyManager` fails to unsuspend package | `ManagedSuspensionReconcilerTest` | `applied=false`, kept in tracked set, recoverable by `clearSuspensions()` |
| Foreground service stopped | `ProtectionEvaluatorTest` + `ProtectionWatchdog` | Reports `DEGRADED`, never `PROTECTED` |
| Phone reboot | `BootReceiver` + `EmergencyAccessTest` | Clears emergency via `BOOT_COUNT`, restores service/managed policy (real-device HyperOS test pending) |
| Emergency Unlock expires | `EmergencyAccessTest` + `EmergencyExpiryReceiver` | Re-arms personal monitor / re-applies managed suspensions |
| Invalid / blank policy entries | `PolicyEvaluatorTest` | Sanitized/ignored; never blocks |
| Default app / app list changes at runtime | `HomeScreen.refreshRuntime()` + `AppUsageMonitorService` + `PolicyEvaluatorTest` | `deviceEssential` refreshed on `ON_RESUME`, `applyRules`, `resyncForeground`, and 60 s poll |
| User edits policy without saving | `HomeScreen` (`saved` vs `pending`) + `ProtectionEvaluatorTest` | Status uses saved policy only; UI shows `"Unsaved changes"` |

## 6. Unverified Items (Physical Device & Remaining Gaps)

1. **Physical Android device (Redmi Note 13 – Android 15 / HyperOS):** Not tested (no device attached via ADB). Real-device overlay latency, HyperOS Autostart / battery-saver survival, and `BOOT_COMPLETED` FGS start remain **unverified**.
2. **Managed Device Owner on real provisioned device:** Not executed on any personal phone (by policy, requires a clean test device).
3. **Windows Agent interactive desktop enforcement:** Live overlay and `terminate` against a foregrounded `--window-probe` and UWP AUMID detection require an interactive desktop session.
4. **Real Supabase stack (`supabase start` / `supabase db reset`):** Pending Milestone 2.

## 7. Remaining Non-P1 Technical Debt

- Two benign Kotlin deprecation warnings in `AppUsageMonitorService.kt` for `UsageEvents.Event.MOVE_TO_FOREGROUND` / `MOVE_TO_BACKGROUND` (kept for API 26–28 compatibility).
- `apps/web/next.config.ts` workspace root warning from Next.js due to an unrelated `package-lock.json` in `C:\Users\hungv\`.
- No P1 bugs remain open in Milestone 1.1; physical-device validation on Redmi Note 13 remains the primary field-test gate before promising Android App Lock reliability to end users.
