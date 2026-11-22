# FocusGate – Milestone 1.2.3 Device Owner Loss Recovery & Emergency Access Reliability Report

Date: 2026-11-22  
Base commit: `8955b88fd27a48fe2d21012536e8ef0de090e8b9`  
Branch: `main`

> **Honesty notice:** All automated JVM unit tests, APK builds, PGlite DB
> checks, TypeScript/Next.js builds, and Windows Agent builds below were
> actually executed and passed. **Physical-device testing on Xiaomi Redmi
> Note 13 (Android 15 / HyperOS) and `connectedPersonalDebugAndroidTest` were
> NOT executed** (`adb devices -l` reported 0 attached devices/emulators).
> `HomeScreen.kt` UI layout, `Notifications.kt` Android notification rendering,
> and `AppUsageMonitorService.kt` overlay triggers were verified by source
> code inspection and compilation only.

## 1. Root Cause of Device Owner Loss Bug

- `PolicyOperationCoordinator.setManagedMode(enabled)` previously checked `if (!before.deviceOwner)` for **both** `enabled = true` and `enabled = false`, blocking users from turning off Managed Mode once Device Owner was revoked.
- `HomeScreen.kt` gated the Managed Mode control behind `if (deviceOwner)`, hiding the exit path whenever `managedEnabled == true` and `deviceOwner == false`.
- `ManagedSuspensionReconciler.applyBlockedPackages()` omitted `tracked` from `unknownPackages` when `!isDeviceOwner()`.

## 2. Fix for Transitioning Back to Personal Mode

- `PolicyOperationCoordinator.setManagedMode(enabled)`:
  - `enabled == true`: still requires `before.deviceOwner == true`; rejects without mutating preferences if Device Owner is absent.
  - `enabled == false`: **always allowed**, even when `before.deviceOwner == false`. Persists `managedEnabled = false`, skips DPM calls when Device Owner is absent, starts Personal Monitor if permissions are granted, runs final audit against `emptySet()`, and surfaces an accurate banner.
- `HomeScreen.kt`: When `managedEnabled == true && !deviceOwner`, displays `"Device Owner permission was lost."`, shows the count of packages requiring verification/recovery, and exposes a `"Switch to Personal Mode"` button. When `deviceOwner == false`, no fake `"Restore suspended apps"` action is shown.

## 3. Recovery Tracking When Device Owner Is Lost

- `trackedPackages` in SharedPreferences is **never** cleared when `isDeviceOwner() == false`.
- `ManagedSuspensionReconciler.auditPolicy()` and `applyBlockedPackages()` place tracked packages into `unknownPackages` with `deviceOwnerValid = false`.
- `ProtectionEvaluator` sets `ProtectionLevel.DEGRADED`, `personalModeReady = false`, and `needsManagedRestore = true` whenever `managedUnknownCount > 0` or `managedExtraSuspendedCount > 0` — even in Personal Mode.

## 4. Recovery Once Device Owner Is Regained

- On `ON_RESUME` (and manual retry), `HomeScreen` runs `coordinator.auditCurrentPolicy()`.
- When `deviceOwner` becomes `true` again while `managedEnabled == false` and tracked packages exist, `auditPolicy(emptySet())` verifies their actual OS state:
  - Any package still `SUSPENDED` appears in `extraSuspended` (`Degraded`, `needsManagedRestore = true`) and unlocks `"Restore suspended apps"` in `HomeScreen`.
  - Calling `coordinator.restoreSuspendedApps()` invokes `clearSuspensions()`, queries every package post-operation, clears tracking once verified `NOT_SUSPENDED`, and immediately updates `HomeScreen` to Personal Mode `Protected` (when Personal permissions & service are ready).

## 5. Root Cause of Emergency Notification Bug

- `AppUsageMonitorService.startEmergencyFromOverlay()` previously launched `coordinator.startEmergency()` asynchronously and immediately called `Notifications.updateMonitorNotification(this, true, true, true)` **before** waiting for `PolicyOperationOutcome`.
- `pollUsage()` also overwrote the monitor notification every 1 second without checking whether Managed suspensions failed to clear or remained `UNKNOWN`.

## 6. Emergency State & Notification Presentation Design

- Added `EmergencyStatusEvaluator` (`apps/android/app/src/main/java/com/focusgate/app/admin/EmergencyStatusEvaluator.kt`) with 4 explicit states:
  - `NORMAL_PROTECTION`
  - `EMERGENCY_ACTIVE`: Emergency window active, zero suspended/unknown apps, `applyResult == null || applyResult.applied` -> `"Emergency access is active. Restrictions are paused."`
  - `EMERGENCY_ACTIVE_DEGRADED`: Emergency window active, but suspended/unknown apps remain, `applyResult?.applied == false`, or Device Owner lost with tracked apps -> `"Emergency access started, but some apps could not be restored (...). Protection is degraded."` + retry button in `HomeScreen`.
  - `EMERGENCY_FAILED`: Coordinator failed or emergency did not activate -> `"Could not verify emergency access..."`.
- `AppUsageMonitorService.startEmergencyFromOverlay()` hides the overlay immediately, awaits `coordinator.startEmergency()`, evaluates `EmergencyStatusPresentation`, updates the ongoing monitor notification, and posts an alert on `CHANNEL_ALERTS` (`NotificationIds.EMERGENCY_ALERT`) for `EMERGENCY_ACTIVE_DEGRADED` or `EMERGENCY_FAILED`.
- `pollUsage()` preserves `lastEmergencyPresentation` while Emergency is active so the 1-second loop never overwrites a degraded emergency status with a false success message.
- `HomeScreen` uses the same `EmergencyStatusEvaluator.evaluateState(...)` and refreshes runtime audit when the emergency timer hits 0.

## 7. Audit Behavior While Emergency Is Active

- `PolicyOperationCoordinator.computeAudit()` uses `required = emptySet()` whenever `state.emergencyActive == true` (even if `managedEnabled == true`).
- Any packages still suspended during Emergency are classified as `extraSuspended` / `verifiedSuspended` (never `requiredNotSuspended`); any unverified packages are reported in `unknownPackages`.
- Saving a new policy during Emergency persists to Room without calling DPM `suspend`; when Emergency ends (`endEmergency()` / `EmergencyExpiryReceiver`), the coordinator reads the latest saved policy and mode from authoritative storage and applies/reconciles accordingly.

## 8. Regression Test Results (103/103 per flavor, 206 total)

All 21 new tests (+ 82 existing = **103 per flavor**) passed on both `personalDebug` and `managedDebug`:

| Suite | Count | Passed | Failed | Skipped | New Tests in Milestone 1.2.3 |
|---|---|---|---|---|---|
| `PolicyOperationCoordinatorTest` | **26** (+20) | 26 | 0 | 0 | **A1–A10** (Device Owner loss enable reject, disable allow, tracking preserved, Personal Monitor start, Degraded with UNKNOWN, Personal Protected when clean, DO regained -> Restore -> Protected, no fake restore, mid-op DO loss) & **B1–B12** (Emergency clean vs DPM fail vs UNKNOWN vs OS-lied SUSPENDED, retry during Emergency, Save during Emergency + End Emergency latest policy, Personal Mode zero DPM calls, EmergencyExpiryReceiver mode sync, coordinator exception `EMERGENCY_FAILED`, DO lost during Emergency, empty-required Emergency audit) |
| `ProtectionEvaluatorTest` | **21** (+1) | 21 | 0 | 0 | `personal mode with lost Device Owner and unverified tracked apps sets needsManagedRestore` |
| `ManagedSuspensionReconcilerTest` | **40** | 40 | 0 | 0 | Post-op verification & recovery tracking |
| `PolicyEvaluatorTest` | **13** | 13 | 0 | 0 | Essential/OEM/dynamic default-app protection |
| `EmergencyAccessTest` | **3** | 3 | 0 | 0 | Bounded emergency window & boot-count expiry |

## 9. Personal Flavor Build & Test

- `:app:testPersonalDebugUnitTest`: **103/103 passed** (0 fail, 0 err, 0 skip) — **Actually executed**.
- `:app:assemblePersonalDebug`: **PASS** (`BUILD SUCCESSFUL`) — **Actually executed**.
- `:app:connectedPersonalDebugAndroidTest`: **NOT RUN / SKIPPED** (`adb devices -l` = 0 attached devices/emulators).

## 10. Managed Flavor Build & Test

- `:app:testManagedDebugUnitTest`: **103/103 passed** (0 fail, 0 err, 0 skip) — **Actually executed**.
- `:app:assembleManagedDebug`: **PASS** (`BUILD SUCCESSFUL`) — **Actually executed**.

## 11. DB / Web / Windows Verification

| Check | Command | Result | Status |
|---|---|---|---|
| Database | `npm run db:verify` | **74 passed, 0 failed** | Actually executed (PGlite, 3 migrations) |
| Web TypeScript | `npm run typecheck` | **PASS** (0 errors) | Actually executed |
| Web Production Build | `npm run build -w @focusgate/web` | **PASS** (Next.js 15.5.29) | Actually executed |
| Windows Agent Build | `dotnet build --no-incremental` | **PASS** (`0 Warning(s), 0 Error(s)`) | Actually executed |

## 12. Untested Physical-Device Items

- **Xiaomi Redmi Note 13 (Android 15 / HyperOS):** Not tested (`adb devices -l` returned 0 connected devices). Real-device overlay latency, HyperOS Autostart/battery behavior, `BOOT_COMPLETED` FGS start, real DPM `DevicePolicyManager` behavior, notification shade rendering, and live Compose tap interactions remain unverified on hardware.

## 13. Open P0 / P1 / P2 Status

- **P0:** None.
- **P1 (Device Owner loss exit & tracking preservation):** **CLOSED** (`M123-A1..A10`).
- **P2 (Overlay Emergency Access outcome & notification sync):** **CLOSED** (`M123-B1..B12`).
- **Remaining non-P1 items:** Physical-device checklist on Redmi Note 13 before Milestone 2 / production claims.
