# FocusGate – Milestone 1.2.1 Hardening Report

Date: 2026-11-22  
Base commit: `f9f983ba1f062721dac0652e9c7ae267d020253a`  
Branch: `main`

> **Honesty notice:** All automated JVM unit tests, APK builds, PGlite DB
> checks, TypeScript/Next.js builds, and Windows Agent builds below were
> actually executed and passed. **Physical-device testing (Redmi Note 13 /
> Android 15 / HyperOS) and `connectedPersonalDebugAndroidTest` were NOT
> executed** (`adb devices -l` reported 0 attached devices/emulators). UI
> rendering in `HomeScreen.kt` and `BootReceiver.kt` reboot paths were
> verified by source code inspection and compilation, not live device execution.

## 1. Bugs Found and Fixed

### 1.1 P1 — Do Not Lose Tracking for `UNKNOWN` Packages (`ManagedSuspensionReconciler.kt`)
- **Root cause:** In `applyBlockedPackages()`, `candidateTracked` previously omitted `failedToSuspend`. If a newly added package failed to suspend (or threw `SecurityException`) and `isPackageSuspended()` subsequently returned `UNKNOWN`, `reconcile()` dropped it because `unknownState.intersect(tracked)` only kept previously tracked packages.
- **Fix:** Added `failedToSuspend` to `candidateTracked`:
  ```kotlin
  val candidateTracked = (before.trackedPackages - unsuspendedOk) +
      suspendedOk +
      failedToUnsuspend +
      failedToSuspend
  ```
  - `SUSPENDED` -> confirmed suspended, kept in `verifiedSuspended` and `trackedPackages`.
  - `NOT_SUSPENDED` -> confirmed not suspended, removed from `trackedPackages`.
  - `UNKNOWN` -> never counted in `verifiedSuspended`, never allows `Protected`, and retained in `trackedPackages` so future policy updates or `clearSuspensions()` continue retrying recovery until a final OS state is verified.

### 1.2 P1 — Never Report `Protected` When Disabling Managed Mode Leaves Apps Suspended (`HomeScreen.kt`, `ProtectionEvaluator.kt`, `BootReceiver.kt`)
- **Root cause:**
  1. `ProtectionEvaluator.evaluate(...)` ignored `managedExtraSuspendedCount` and `managedUnknownCount` in the Personal Mode (`!managedEnforced`) branch.
  2. `HomeScreen.refreshManagedAudit()` skipped `auditPolicy()` when `!managedEnabled && !isDeviceOwner()` (even if `trackedPackages` still existed in prefs) and passed `savedBlocked`/`savedExempt` instead of `emptySet()` when Managed Mode was off.
  3. `BootReceiver` did not clear lingering managed suspensions on reboot when `monitorEnabled = true` and `managedRequested = false`.
- **Fix:**
  - `ProtectionEvaluator` now checks `hasLingeringManaged` (`managedExtraSuspendedCount > 0 || managedUnknownCount > 0`) in Personal Mode: forces `ProtectionLevel.DEGRADED`, `personalModeReady = false`, `needsManagedRestore = true`, and surfaces exact counts + clear issue messages.
  - `HomeScreen.refreshManagedAudit()` audits against `emptySet()` whenever `managedEnabled == false` (Personal Mode), so any lingering `verifiedSuspended` or `unknownPackages` from Managed Mode are detected even after toggling Managed Mode off or losing Device Owner.
  - `HomeScreen` displays `"Restore suspended apps"` whenever `protection.needsManagedRestore && deviceOwner` (including in Personal Mode), and omits fake restore actions when Device Owner is lost.
  - `BootReceiver` calls `controller.clearSuspensions()` on boot when `!managedRequested && controller.isDeviceOwner()`.

### 1.3 P2 — Operation Result Must Reflect Final Verified OS State (`ManagedSuspensionReconciler.kt`, `ManagedApplyResult.kt`)
- **Root cause:** `exactMatch` and `cleared` previously required `securityError == null`. If `DevicePolicyManager` threw `SecurityException` but re-querying OS state confirmed all packages reached the exact desired state, `ManagedApplyResult.applied` returned `false` while `ProtectionEvaluator` showed `Protected`.
- **Fix:**
  - `exactMatch` (`applyBlockedPackages`) and `cleared` (`clearSuspensions`) now rely on `ownerStillValid` and the post-operation `reconcile(...)` OS snapshot as the primary source of truth.
  - Added `exceptionMessage: String?` to `ManagedApplyResult` to preserve caught exception details for debugging/logging without contradicting verified OS state.
  - If any package remains `UNKNOWN` or mismatched, or Device Owner was lost mid-operation, `applied` is strictly `false`.

## 2. Files Changed

- `apps/android/app/src/main/java/com/focusgate/app/admin/ManagedApplyResult.kt`
- `apps/android/app/src/main/java/com/focusgate/app/admin/ManagedSuspensionReconciler.kt`
- `apps/android/app/src/main/java/com/focusgate/app/policy/ProtectionEvaluator.kt`
- `apps/android/app/src/main/java/com/focusgate/app/service/BootReceiver.kt`
- `apps/android/app/src/main/java/com/focusgate/app/ui/HomeScreen.kt`
- `apps/android/app/src/test/java/com/focusgate/app/admin/ManagedSuspensionReconcilerTest.kt`
- `apps/android/app/src/test/java/com/focusgate/app/policy/ProtectionEvaluatorTest.kt`
- `README.md`
- `apps/android/README.md`
- `docs/ANDROID_LOCK.md`
- `docs/DEVELOPMENT_ROADMAP.md`
- `docs/MILESTONE1_2_1_TEST_REPORT.md` (new)

## 3. Final Tracking & Recovery Design

- **Reconciliation (`reconcile`):** Queries `isPackageSuspended` for `tracked ∪ candidates` and partitions into `verifiedSuspended`, `verifiedNotSuspended`, and `unknownState`. `trackedPackages = verifiedSuspended ∪ (unknownState ∩ tracked)`.
- **Operation (`applyBlockedPackages` / `clearSuspensions`):**
  1. Reconciles pre-operation state.
  2. Executes unsuspend then suspend via `ManagedSuspensionBackend`, catching `SecurityException`.
  3. Builds `candidateTracked` including `failedToUnsuspend` AND `failedToSuspend`.
  4. Verifies `isDeviceOwner()` post-operation and re-reconciles OS state (`after`).
  5. Persists `after.trackedPackages` and derives `applied` solely from `ownerStillValid` + `after` matching the policy (with zero `UNKNOWN` packages).
- **Mode Transitions:** When `managedEnabled == false`, `HomeScreen` audits Managed Mode with `requiredPackages = emptySet()`. Any lingering `verifiedSuspended` or `unknownPackages` forces `ProtectionLevel.DEGRADED` in Personal Mode until cleared and verified.

## 4. Regression Test Results (60/60 per flavor, 120 total)

All 16 new regression tests (+ 44 existing = **60 per flavor**) passed on both `personalDebug` and `managedDebug`:

| Group / Suite | Test | Result | Verified Assertions |
|---|---|---|---|
| **Group A (Reconciler)** | `A1` – New pkg `SecurityException` + `UNKNOWN` retained in tracking | **PASS** | `applied=false`, `unknownPackages=[yt]`, `backend.tracked=[yt]`, `audit.isExactMatch=false`, `DEGRADED` |
| **Group A (Reconciler)** | `A2` – `UNKNOWN` pkg removed from policy stays tracked & retries unsuspend | **PASS** | `applied=false`, `failedToUnsuspend=[yt]`, `backend.tracked=[yt]`, `DEGRADED`, `needsManagedRestore=true` |
| **Group A (Reconciler)** | `A3` – `UNKNOWN` pkg becoming `NOT_SUSPENDED` removed from tracking | **PASS** | `applied=true`, `backend.tracked=[]`, `audit.isExactMatch=true`, `OFF` |
| **Group A (Reconciler)** | `A4` – `UNKNOWN` pkg becoming `SUSPENDED` transitions to `Protected` | **PASS** | `applied=true`, `backend.tracked=[yt]`, `osSuspended=[yt]`, `PROTECTED` |
| **Group A (Reconciler)** | `A5` – `UNKNOWN` target pkg without prior tracking cannot report `Protected` | **PASS** | `verifiedSuspended=[]`, `unknownPackages=[yt]`, `DEGRADED` |
| **Group B (Transition)** | `B6` – Disabling Managed Mode with full restore allows Personal `Protected` | **PASS** | `applied=true`, `tracked=[]`, `osSuspended=[]`, `PROTECTED` (`personalModeReady=true`) |
| **Group B (Transition)** | `B7` – Disabling Managed Mode when 1 app fails unsuspend shows `Degraded` | **PASS** | `applied=false`, `tracked=[yt]`, `osSuspended=[yt]`, `DEGRADED`, `needsManagedRestore=true` |
| **Group B (Transition)** | `B8` – Disabling Managed Mode with `UNKNOWN` app shows `Degraded` | **PASS** | `applied=false`, `tracked=[yt]`, `unknownPackages=[yt]`, `DEGRADED`, `needsManagedRestore=true` |
| **Group B (Transition)** | `B9` – Retrying restore after Personal transition updates to `Protected` | **PASS** | `DEGRADED` -> retry `applied=true` -> `tracked=[]`, `PROTECTED` (`personalModeReady=true`) |
| **Group B (Transition)** | `B10` – Revoking Device Owner with lingering pkgs reports `Degraded` | **PASS** | `applied=false`, `deviceOwnerValid=false`, `tracked=[yt]`, `DEGRADED` |
| **Group C (Exceptions)** | `C11` – `apply` throws `SecurityException` after OS suspended all -> `applied=true` | **PASS** | `applied=true`, `exceptionMessage!=null`, `tracked=[yt,tt]`, `PROTECTED` |
| **Group C (Exceptions)** | `C12` – `clear` throws `SecurityException` after OS unsuspended all -> `applied=true` | **PASS** | `applied=true`, `exceptionMessage!=null`, `tracked=[]`, `PROTECTED` |
| **Group C (Exceptions)** | `C13` – `apply` throws `SecurityException` & OS `UNKNOWN` -> `applied=false` | **PASS** | `applied=false`, `unknownPackages=[yt]`, `tracked=[yt]`, `DEGRADED` |
| **Group C (Exceptions)** | `C14` – Step 1 unsuspend ok, step 2 `SecurityException` preserves step 1 + tracks `UNKNOWN` | **PASS** | `yt` removed from `osSuspended` & `tracked`; `tt` kept in `tracked`; `DEGRADED` |
| **ProtectionEvaluator** | Personal Mode cannot report `Protected` with lingering `extraSuspended` | **PASS** | `DEGRADED`, `personalModeReady=false`, `needsManagedRestore=true` |
| **ProtectionEvaluator** | Personal Mode cannot report `Protected` with lingering `unknown` packages | **PASS** | `DEGRADED`, `personalModeReady=false`, `needsManagedRestore=true` |

## 5. Build & Cross-Stack Verification Results

| Check | Command | Result | Details |
|---|---|---|---|
| Android Unit Tests (`personalDebug`) | `.\gradlew.bat --no-daemon :app:testPersonalDebugUnitTest` | **PASS** | **60/60** (`ManagedSuspensionReconcilerTest` 26, `PolicyEvaluatorTest` 13, `ProtectionEvaluatorTest` 18, `EmergencyAccessTest` 3), 0 fail, 0 skip |
| Android Unit Tests (`managedDebug`) | `.\gradlew.bat --no-daemon :app:testManagedDebugUnitTest` | **PASS** | **60/60** (same breakdown), 0 fail, 0 skip |
| Android Debug APKs | `:app:assemblePersonalDebug :app:assembleManagedDebug` | **PASS** | `BUILD SUCCESSFUL in 48s` (JDK 17, Android SDK 36) |
| Android Connected Tests | `:app:connectedPersonalDebugAndroidTest` | **NOT RUN** | `adb devices -l` reported 0 attached devices/emulators |
| Database Verification | `npm run db:verify` | **PASS** | **74 passed, 0 failed** (PGlite, 3 migrations) |
| Web Typecheck | `npm run typecheck` | **PASS** | `0` TypeScript errors |
| Web Production Build | `npm run build -w @focusgate/web` | **PASS** | Next.js 15.5.29 build succeeded |
| Windows Agent Build | `dotnet build --no-incremental` | **PASS** | `0 Warning(s), 0 Error(s)` (`Time Elapsed 00:00:03.99`) |

## 6. Verification Scope & Untested Items

- **Actually executed:** All 120 JVM unit tests (`60` per flavor), both Android debug APK builds, `npm run db:verify` (74 assertions), `npm run typecheck`, `npm run build -w @focusgate/web`, and `dotnet build --no-incremental`.
- **Verified by source code inspection only:** `HomeScreen.kt` Compose UI layout/button wiring and `BootReceiver.kt` boot-time `clearSuspensions()` call.
- **Not tested:** Physical device (Redmi Note 13 / Android 15 / HyperOS), emulator instrumentation (`connectedPersonalDebugAndroidTest`), real Device Owner provisioning on a factory-reset device, and real Supabase stack.

## 7. P1 / P2 Status After Milestone 1.2.1

- **P1 – Lost tracking on `UNKNOWN` package:** **CLOSED** (verified by A1–A5, C13–C14).
- **P1 – False `Protected` on Managed-to-Personal transition:** **CLOSED** (verified by B6–B10 & `ProtectionEvaluatorTest`).
- **P2 – `ManagedApplyResult` mismatch with final OS state after `SecurityException`:** **CLOSED** (verified by C11–C14).
- **Open P1 bugs in Managed Suspension / Protection State:** **None**.
