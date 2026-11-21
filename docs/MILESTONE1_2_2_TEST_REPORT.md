# FocusGate – Milestone 1.2.2 Post-Operation Verification & Serialized Transitions Report

Date: 2026-11-22  
Base commit: `769b6c023d28286652a146805e15cc53967f73d5`  
Branch: `main`

> **Honesty notice:** All automated JVM unit tests, APK builds, PGlite DB
> checks, TypeScript/Next.js builds, and Windows Agent builds below were
> actually executed and passed. **Physical-device testing on Xiaomi Redmi
> Note 13 (Android 15 / HyperOS) and `connectedPersonalDebugAndroidTest` were
> NOT executed** (`adb devices -l` reported 0 attached devices/emulators).
> UI rendering in `HomeScreen.kt` and `BootReceiver`/`EmergencyExpiryReceiver`
> runtime broadcasts were verified by source inspection and compilation only.

## 1. Issues Found After Milestone 1.2.1

1. **P1 – Incomplete post-operation OS verification (`ManagedSuspensionReconciler.kt`):**
   - `applyBlockedPackages()` built `candidateTracked` as `(before.trackedPackages - unsuspendedOk) + suspendedOk + failedToUnsuspend + failedToSuspend`, and `clearSuspensions()` built `(toClear - unsuspendedOk) + failedToUnsuspend`.
   - Any package DPM reported as `unsuspendedOk` was excluded from post-operation `reconcile(...)`. If DPM returned success while OS state remained `SUSPENDED` or `UNKNOWN`, FocusGate dropped it from tracking and could return `applied = true`.
2. **P2 – Race condition across Save Policy, Apply Policy, Clear Suspensions, Emergency, and Boot Recovery:**
   - `HomeScreen.savePolicy()` previously captured `pendingBlocked`/`pendingExempt` and `managedActive` before/around async Room I/O, and `AppUsageMonitorService` / `BootReceiver` / `EmergencyExpiryReceiver` called `ManagedDeviceController` directly without a shared lock.
   - Rapid Save → Disable Managed or double Save could apply stale policy or stale mode state out of order.

## 2. Root Causes

- Relying on DPM's returned failure array (`unsuspendedOk` / `suspendedOk`) as proof that OS state actually changed, rather than re-querying every involved package post-operation.
- Lacking an application-wide single-`Mutex` coordinator to serialize all policy, mode, emergency, and boot transitions against authoritative DB/preference reads.

## 3. Post-Operation Verification Solution

- In `applyBlockedPackages()`:
  `involvedPackages = tracked + before.trackedPackages + target + toUnsuspend + toSuspend + failedToUnsuspend + failedToSuspend`
  Every involved package is queried via `reconcile(involvedPackages, target, backend)` after `setPackagesSuspended(...)` (regardless of whether DPM reported success, partial failure, or threw `SecurityException`).
- In `clearSuspensions()`:
  `involvedPackages = tracked + toClear + failedToUnsuspend`
  Every package is queried via `reconcile(involvedPackages, emptySet(), backend)` after DPM unsuspend.
- `ManagedApplyResult.applied` is derived **strictly** from post-operation `ownerStillValid` + verified OS state matching the target (`remainingMissing.isEmpty() && remainingExtra.isEmpty() && unknownList.isEmpty()`), never from DPM's return value alone.
- `exceptionMessage` preserves any caught `SecurityException` for logging without contradicting `ProtectionStatus` if final OS state is verified exact match.

## 4. Final Recovery Tracking Design

| Post-Operation OS State | Action |
|---|---|
| `SUSPENDED` | Kept in `verifiedSuspended` and `trackedPackages`; flagged in `extraSuspended` if outside target |
| `NOT_SUSPENDED` (not in target) | Verified cleared; removed from `trackedPackages` |
| `NOT_SUSPENDED` (still in target) | Flagged in `requiredNotSuspended` and `failedToSuspend`; `applied = false` |
| `UNKNOWN` (in `involvedPackages`) | Never counted in `verifiedSuspended`; retained in `trackedPackages` for retry/recovery; `applied = false` |

## 5. Policy Operation Coordinator Design

- Added `PolicyOperationCoordinator` (`apps/android/app/src/main/java/com/focusgate/app/admin/PolicyOperationCoordinator.kt`) backed by `AndroidPolicyCoordinatorStore` and hosted on `FocusGateApp.policyCoordinator`.
- Uses a single coroutine `Mutex` with non-reentrant internal `reconcileLocked(reason)` helper (zero nested locking / zero `Thread.sleep`).
- Every entry point (`savePolicy`, `applyManagedPolicy`, `restoreSuspendedApps`, `setMonitoring`, `setManagedMode`, `startEmergency`, `endEmergency`, `bootRecover`, `reconcileCurrentPolicy`, `auditCurrentPolicy`) acquires the lock, re-reads authoritative Room DB + `AgentPreferences` + `DevicePolicyManager.isDeviceOwnerApp` + `EmergencyAccess`, executes at most one DPM transition, runs post-operation audit, and returns `PolicyOperationOutcome`.
- Verified via call-site scan: zero direct `setPackagesSuspended` / `applyBlockedPackages` / `clearSuspensions` calls remain outside `ManagedDeviceController` / `AndroidPolicyCoordinatorStore`.
- `HomeScreen` disables policy action buttons/switches while `isOperationInProgress` and applies only the latest sequence outcome.

## 6. Flow: Save → Apply → Audit

```
User taps Save
  │
  ▼
HomeScreen.runPolicyOperation() [disables action buttons, increments sequence]
  │
  ▼
PolicyOperationCoordinator.savePolicy(pendingBlocked, pendingExempt)
  ├── mutex.withLock
  ├── store.saveRules(blocked, exempt)  ──► Room @Transaction replaceAll
  ├── reconcileLocked("save")
  │     ├── store.readRuntimeState()    ──► fresh monitorEnabled, managedEnabled, deviceOwner, emergencyActive, savedBlocked/Exempt
  │     ├── if Managed active & !emergency -> applyManaged() -> reconcile(involvedPackages) -> saveTrackedSuspended()
  │     └── else if Managed off & lingering tracked -> clearManaged() -> reconcile(involvedPackages)
  └── computeAudit() ──► PolicyOperationOutcome ──► HomeScreen applies latest state & banner
```

## 7. Flow: Disable Managed → Clear → Verify

```
User toggles Managed Device Mode OFF
  │
  ▼
PolicyOperationCoordinator.setManagedMode(false)
  ├── mutex.withLock
  ├── store.setManagedEnabled(false)
  ├── reconcileLocked("disable_managed")
  │     ├── store.readRuntimeState()    ──► managedEnabled == false
  │     ├── preAudit = store.auditManaged(emptySet())
  │     ├── if deviceOwner && lingering -> store.clearManaged() -> reconcile(all toClear)
  │     └── if monitorEnabled && personal permissions -> store.startPersonalMonitor()
  └── computeAudit(emptySet())
        ├── all NOT_SUSPENDED & empty tracked -> Personal Mode Protected (if permissions + service ok)
        └── any SUSPENDED or UNKNOWN remaining -> Degraded + "Restore suspended apps" button
```

## 8. Regression Test Results (82/82 per flavor, 164 total)

| Test Suite | Executed | Passed | Failed | Skipped | Scope Covered |
|---|---|---|---|---|---|
| `ManagedSuspensionReconcilerTest` | **40** | 40 | 0 | 0 | M1.2.2 Group A (`M122-A1..A6`), Group B (`M122-B1..B5`), Group C (`M122-C1..C3`), plus all M1.2/1.2.1 `UNKNOWN` & `SecurityException` tests |
| `PolicyOperationCoordinatorTest` | **6** | 6 | 0 | 0 | Deterministic `CompletableDeferred` tests: Scenario A (Save → Disable Managed), Scenario B (Disable Managed → Save), Scenario C (two rapid Saves, latest wins, `maxConcurrentDpmCalls == 1`), Scenario D (Emergency → Save → End Emergency), Scenario E (Boot Recovery Personal lingering clear & Managed apply) |
| `ProtectionEvaluatorTest` | **20** | 20 | 0 | 0 | Audit mismatch → `Degraded`, `UNKNOWN` → never `Protected`, Personal Mode `Degraded` until lingering suspensions verified cleared, `Managed` not `Protected` without exact match |
| `PolicyEvaluatorTest` | **13** | 13 | 0 | 0 | Essential/OEM/dynamic default apps, blank entries, exempt precedence |
| `EmergencyAccessTest` | **3** | 3 | 0 | 0 | Bounded emergency window & boot-count expiry |

## 9. Android Personal Build & Test

- `:app:testPersonalDebugUnitTest`: **82/82 passed** (0 fail, 0 err, 0 skip) — **Actually executed**.
- `:app:assemblePersonalDebug`: **PASS** (`BUILD SUCCESSFUL`) — **Actually executed**.
- `:app:connectedPersonalDebugAndroidTest`: **SKIPPED / NOT RUN** (`adb devices -l` = 0 devices/emulators).

## 10. Android Managed Build & Test

- `:app:testManagedDebugUnitTest`: **82/82 passed** (0 fail, 0 err, 0 skip) — **Actually executed**.
- `:app:assembleManagedDebug`: **PASS** (`BUILD SUCCESSFUL`) — **Actually executed**.

## 11. DB / Web / Windows Verification

| Check | Command | Result | Status |
|---|---|---|---|
| Database | `npm run db:verify` | **74 passed, 0 failed** | Actually executed (PGlite) |
| Web TypeScript | `npm run typecheck` | **PASS** (0 errors) | Actually executed |
| Web Production Build | `npm run build -w @focusgate/web` | **PASS** (Next.js 15.5.29) | Actually executed |
| Windows Agent Build | `dotnet build --no-incremental` | **PASS** (`0 Warning(s), 0 Error(s)`) | Actually executed |

## 12. Untested Physical-Device Scenarios & Platform Limits

- **Not tested on physical Redmi Note 13 (Android 15 / HyperOS):** Overlay latency, HyperOS Autostart / battery restrictions, `BOOT_COMPLETED` FGS start, real `DevicePolicyManager` suspension behavior, and interactive Compose UI tap behavior (`HomeScreen.kt`, `BootReceiver.kt`, `EmergencyExpiryReceiver.kt` verified by source inspection + compilation only).
- **Platform limits:** Personal Strict Mode (`UsageStatsManager` + `TYPE_APPLICATION_OVERLAY`) remains revocable friction; Managed Mode requires Device Owner provisioning on a dedicated/factory-reset device.

## 13. Open P0 / P1 / P2 Status

- **P0:** None.
- **P1 (Managed Suspension post-op verification & Personal Mode lingering check):** **CLOSED** (verified by `M122-A1..A6`, `M122-B1..B5`, `M122-C1..C3`).
- **P2 (Policy transition serialization & stale state):** **CLOSED** (verified by `PolicyOperationCoordinatorTest` Scenarios A–E and DPM call-site audit).
- **Pending gate:** Physical-device validation on Redmi Note 13 before moving to Milestone 2 / production claims.
