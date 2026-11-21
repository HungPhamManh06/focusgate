# FocusGate – Milestone 1.2 Verified Protection State Report

Date: 2026-11-22  
Base commit: `e5328b8a44ac15bbfa2271d2517bb292c722a262`  
Branch: `main`

> **Honesty notice:** All automated JVM unit tests, APK builds, PGlite DB
> checks, TypeScript/Next.js builds, and Windows Agent builds below were
> executed and passed. **Physical-device testing on Xiaomi (Redmi Note 13 /
> Android 15 / HyperOS) and `connectedPersonalDebugAndroidTest` were NOT
> executed** (`adb devices -l` reported 0 attached devices/emulators). No claim
> is made that App Lock behaves reliably on Xiaomi phones until tested on the
> physical device.

## 1. Bugs Fixed

1. **Unverified (`UNKNOWN`) state could previously be treated as suspended:**
   - `reconcileActualSuspended()` previously folded `PackageSuspensionState.UNKNOWN` tracked packages into the active suspended set (`UNKNOWN -> if (pkg in tracked) add(pkg)`), which could let an unverified package satisfy `Protected`.
   - Fixed by separating `verifiedSuspended`, `verifiedNotSuspended`, `unknownState`, and `trackedPackages` in `ManagedSuspensionSnapshot` and `ManagedPolicyAudit`. Tracked-unknown packages remain persisted for recovery/retry, but **never** count toward `verifiedSuspended` and **always** degrade status to `DEGRADED`.
2. **One-way policy check missed extra suspended apps and lingering suspensions:**
   - `HomeScreen` previously only counted required apps that were not suspended.
   - Added two-way `ManagedPolicyAudit` (`requiredNotSuspended`, `extraSuspended`, `unknownPackages`, `deviceOwnerValid`) and updated `ProtectionEvaluator` so `PROTECTED` requires **all 5 conditions**:
     1. All required apps are verified suspended (`managedUnsuspendedCount == 0`).
     2. No extra apps outside the saved policy remain suspended (`managedExtraSuspendedCount == 0`).
     3. No package has `UNKNOWN` state (`managedUnknownCount == 0`).
     4. Device Owner is valid (`!managedDeviceOwnerLost`).
     5. Emergency Unlock is not active (`!emergencyActive`).
   - When the policy is empty or monitoring is off, but FocusGate still has suspended or unverified apps, status now reports `DEGRADED` with `needsManagedRestore = true` (not `OFF`) and offers a `"Restore suspended apps"` action.
3. **Partial `SecurityException` on the second DPM call previously risked overwriting earlier progress:**
   - In `ManagedSuspensionReconciler.applyBlockedPackages()`, if `setPackagesSuspended(toUnsuspend, false)` succeeded and the subsequent `setPackagesSuspended(toSuspend, true)` threw `SecurityException`, previously the stale pre-operation snapshot was saved.
   - Fixed by tracking step-by-step outcomes (`unsuspendedOk`, `failedToUnsuspend`, `suspendedOk`, `failedToSuspend`) and re-reconciling against `DevicePolicyManager.isPackageSuspended` after the exception. Packages successfully unsuspended in step 1 are removed from tracking; failed/unverified packages remain tracked; `applied` is `false`.
4. **Actionable `HomeScreen` Protection Status UI:**
   - Added explicit status descriptions for `Protected`, `Degraded`, and `Off`.
   - When `Degraded` in Managed Mode, displays exact counts (`Not suspended`, `Extra suspended`, `Unverified`) plus a one-tap `"Re-apply policy"` or `"Restore suspended apps"` button.

## 2. Verified State Design

```
Tracked prefs + Required policy
        │
        ▼
ManagedSuspensionReconciler.reconcile()  ──► DevicePolicyManager.isPackageSuspended()
        │
        ├── verifiedSuspended     (OS confirmed SUSPENDED)
        ├── verifiedNotSuspended  (OS confirmed NOT_SUSPENDED or NameNotFoundException)
        ├── unknownState          (SecurityException / API unavailable — NEVER trusted as Protected)
        └── trackedPackages       (verifiedSuspended ∪ (unknownState ∩ tracked) — for recovery)
        │
        ▼
ManagedPolicyAudit
        ├── requiredNotSuspended  = required - verifiedSuspended - unknownState
        ├── extraSuspended        = verifiedSuspended - required
        ├── unknownPackages       = unknownState (or required ∪ tracked if Device Owner lost)
        └── isExactMatch          = deviceOwnerValid && all three sets empty
```

## 3. Regression Tests Added

All 10 mandatory regression scenarios (plus existing safety & recovery tests) were implemented and verified on both `personalDebug` and `managedDebug` flavors:

| Suite | Count | Key Scenarios Verified |
|---|---|---|
| `ManagedSuspensionReconcilerTest` | **12** | (1) Tracked pkg with `UNKNOWN` OS state → kept in tracking, `DEGRADED`; (2) Target pkg with `UNKNOWN` OS state → `DEGRADED`; (3) Required app not suspended → `DEGRADED` + missing count; (4) Extra suspended app outside policy → `DEGRADED` + extra count; (5) Empty policy + lingering suspended app → `DEGRADED` + `needsManagedRestore` (not `OFF`); (6) Policy change + unsuspend failure → kept tracked + `DEGRADED`; (7) Unsuspend succeeds then second call suspend throws `SecurityException` → step-1 unsuspend preserved, no stale snapshot; (8) `UNKNOWN` package recovers to `PROTECTED` when DPM works again; (9) Lost Device Owner → `DEGRADED`; (10) External OS state change reconciled back to `PROTECTED`; plus `clearSuspensions` retry recovery and essential/exempt/own-package exclusion |
| `ProtectionEvaluatorTest` | **16** (+4) | Extra suspended apps → `DEGRADED`; unknown packages → `DEGRADED`; empty policy + lingering suspended apps → `DEGRADED` + `needsManagedRestore`; lost Device Owner → `DEGRADED`; plus unsaved-changes and Personal Mode sync checks |
| `PolicyEvaluatorTest` | **13** | OEM essential list, dynamic default launcher/dialer/SMS updates, System UI/Permission Controller/Emergency protection, malformed/blank policy entries |
| `EmergencyAccessTest` | **3** | Bounded emergency window & boot-count expiry |
| **Total per flavor** | **44** | **88/88 executed across `personalDebug` and `managedDebug`** |

## 4. Build & Test Results

| Command | Result | Observed Output |
|---|---|---|
| `.\gradlew.bat --no-daemon :app:testPersonalDebugUnitTest :app:testManagedDebugUnitTest :app:assemblePersonalDebug :app:assembleManagedDebug` (JDK 17, SDK 36) | **PASS** | `BUILD SUCCESSFUL in 53s`; `testPersonalDebugUnitTest` **44/44 passed** (0 fail, 0 err, 0 skip); `testManagedDebugUnitTest` **44/44 passed** (0 fail, 0 err, 0 skip); both debug APKs built |
| `:app:connectedPersonalDebugAndroidTest` | **NOT RUN** | `adb devices -l` returned 0 connected emulators/devices |
| `npm run db:verify` | **PASS** | **74 passed, 0 failed** across 3 migrations on PGlite |
| `npm run typecheck` | **PASS** | `0` TypeScript errors |
| `npm run build -w @focusgate/web` | **PASS** | Next.js 15.5.29 production build succeeded |
| `dotnet build --no-incremental` (in `apps/windows-agent`) | **PASS** | `0 Warning(s), 0 Error(s)` (`Time Elapsed 00:00:04.06`) |

## 5. Unverified Scenarios & Android Platform Limitations

- **Unverified:**
  - Physical Xiaomi Redmi Note 13 (Android 15 / HyperOS) behavior: overlay latency, HyperOS Autostart / battery restrictions, `BOOT_COMPLETED` foreground-service start, and real-world permission revocation UX.
  - `connectedPersonalDebugAndroidTest` instrumentation run (no emulator booted during this verification pass).
  - Managed Device Owner provisioning on a dedicated factory-reset device.
  - Real Supabase stack (`supabase start` / `supabase db reset`).
- **Android Platform Limitations:**
  - Personal Strict Mode (`UsageStatsManager` + `TYPE_APPLICATION_OVERLAY`) is user-revocable friction, not tamper-proof enforcement.
  - Managed Device Mode (`setPackagesSuspended`) requires legitimate Device Owner provisioning and is not available on personal phones without factory-reset DPC setup.
  - `DevicePolicyManager.isPackageSuspended()` only reports suspension state for packages visible to the DPC and while Device Owner remains active; if Device Owner is revoked, state is necessarily `UNKNOWN`.

## 6. Remaining Issues / Next Gate

- No P1 status-accuracy bugs remain in the Protection State / Managed Mode logic.
- Remaining benign warnings: 2 Kotlin deprecation warnings in `AppUsageMonitorService.kt` (`MOVE_TO_FOREGROUND`/`MOVE_TO_BACKGROUND` retained for API 26–28) and Next.js `outputFileTracingRoot` notice due to a parent `package-lock.json`.
- Before claiming mobile readiness on Xiaomi, connect Redmi Note 13 via ADB and execute the 12-step physical-device checklist in `docs/MILESTONE1_TEST_REPORT.md`.
