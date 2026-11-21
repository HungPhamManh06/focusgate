package com.focusgate.app.admin

import com.focusgate.app.policy.PolicyEvaluator

enum class PackageSuspensionState {
    SUSPENDED,
    NOT_SUSPENDED,
    UNKNOWN,
}

/**
 * Narrow interface over DevicePolicyManager and local persistence so managed
 * suspension state transitions can be thoroughly unit-tested on the JVM.
 */
interface ManagedSuspensionBackend {
    fun isDeviceOwner(): Boolean
    fun loadTrackedSuspended(): Set<String>
    fun saveTrackedSuspended(packages: Set<String>)
    fun setPackagesSuspended(packages: Set<String>, suspended: Boolean): Set<String>
    fun querySuspensionState(packageName: String): PackageSuspensionState
}

/**
 * Pure reconciliation logic for Device Owner package suspension.
 *
 * Keeps suspend and unsuspend failures strictly separate so a package that
 * failed to unsuspend is never silently dropped from tracking, and a package
 * that failed to suspend is never recorded as protected.
 */
object ManagedSuspensionReconciler {

    fun applyBlockedPackages(
        blockedPackages: Set<String>,
        exemptPackages: Set<String>,
        ownPackage: String,
        deviceEssential: Set<String>,
        backend: ManagedSuspensionBackend,
    ): ManagedApplyResult {
        if (!backend.isDeviceOwner()) {
            return ManagedApplyResult(
                applied = false,
                suspendedPackages = 0,
                failures = emptyList(),
                message = "Device Owner provisioning is required for managed enforcement.",
            )
        }

        val target = PolicyEvaluator.effectiveBlocked(
            blockedPackages = blockedPackages,
            exemptPackages = exemptPackages,
            ownPackage = ownPackage,
            deviceEssential = deviceEssential,
        )

        val tracked = backend.loadTrackedSuspended()
        val actualSuspended = reconcileActualSuspended(tracked, target, backend)
        val toUnsuspend = actualSuspended - target
        val toSuspend = target - actualSuspended

        return try {
            val failedToUnsuspend = if (toUnsuspend.isNotEmpty()) {
                backend.setPackagesSuspended(toUnsuspend, suspended = false)
            } else {
                emptySet()
            }
            val failedToSuspend = if (toSuspend.isNotEmpty()) {
                backend.setPackagesSuspended(toSuspend, suspended = true)
            } else {
                emptySet()
            }

            // Only drop packages whose unsuspend actually succeeded, and only
            // record packages whose suspend actually succeeded.
            val unsuspendedOk = toUnsuspend - failedToUnsuspend
            val suspendedOk = toSuspend - failedToSuspend
            val nextSuspended = (actualSuspended - unsuspendedOk) + suspendedOk

            backend.saveTrackedSuspended(nextSuspended)

            val suspendFailList = failedToSuspend.toList().sorted()
            val unsuspendFailList = failedToUnsuspend.toList().sorted()
            val allFailures = (failedToSuspend + failedToUnsuspend).toList().sorted()
            val applied = failedToSuspend.isEmpty() && failedToUnsuspend.isEmpty()

            val message = when {
                applied -> "Managed policy applied to ${nextSuspended.size} app(s)."
                suspendFailList.isNotEmpty() && unsuspendFailList.isNotEmpty() ->
                    "${suspendFailList.size} app(s) could not be suspended and " +
                        "${unsuspendFailList.size} could not be resumed."
                suspendFailList.isNotEmpty() ->
                    "${suspendFailList.size} app(s) could not be suspended."
                else ->
                    "${unsuspendFailList.size} app(s) could not be resumed."
            }

            ManagedApplyResult(
                applied = applied,
                suspendedPackages = nextSuspended.size,
                failures = allFailures,
                message = message,
                failedToSuspend = suspendFailList,
                failedToUnsuspend = unsuspendFailList,
            )
        } catch (exception: SecurityException) {
            backend.saveTrackedSuspended(actualSuspended)
            ManagedApplyResult(
                applied = false,
                suspendedPackages = actualSuspended.size,
                failures = listOf(exception.message ?: "SecurityException"),
                message = "Managed policy was rejected by Android.",
                failedToSuspend = toSuspend.toList().sorted(),
                failedToUnsuspend = toUnsuspend.toList().sorted(),
            )
        }
    }

    fun clearSuspensions(backend: ManagedSuspensionBackend): ManagedApplyResult {
        if (!backend.isDeviceOwner()) {
            return ManagedApplyResult(
                applied = false,
                suspendedPackages = 0,
                failures = emptyList(),
                message = "Not a Device Owner.",
            )
        }

        val tracked = backend.loadTrackedSuspended()
        val actualSuspended = reconcileActualSuspended(tracked, emptySet(), backend)
        if (actualSuspended.isEmpty()) {
            if (tracked.isNotEmpty()) backend.saveTrackedSuspended(emptySet())
            return ManagedApplyResult(
                applied = true,
                suspendedPackages = 0,
                failures = emptyList(),
                message = "No managed suspensions to clear.",
            )
        }

        return try {
            val failedToUnsuspend = backend.setPackagesSuspended(actualSuspended, suspended = false)
            // Keep any package that failed to unsuspend in tracking so later
            // retries or clearSuspensions() calls can still recover it.
            val remaining = failedToUnsuspend.intersect(actualSuspended) + failedToUnsuspend
            backend.saveTrackedSuspended(remaining)

            val failList = remaining.toList().sorted()
            ManagedApplyResult(
                applied = failList.isEmpty(),
                suspendedPackages = remaining.size,
                failures = failList,
                message = if (failList.isEmpty()) {
                    "All managed suspensions removed."
                } else {
                    "${failList.size} app(s) could not be resumed."
                },
                failedToUnsuspend = failList,
            )
        } catch (exception: SecurityException) {
            backend.saveTrackedSuspended(actualSuspended)
            ManagedApplyResult(
                applied = false,
                suspendedPackages = actualSuspended.size,
                failures = listOf(exception.message ?: "SecurityException"),
                message = "Android rejected the request.",
                failedToUnsuspend = actualSuspended.toList().sorted(),
            )
        }
    }

    fun reconcileActualSuspended(
        tracked: Set<String>,
        candidates: Set<String>,
        backend: ManagedSuspensionBackend,
    ): Set<String> = buildSet {
        for (pkg in tracked + candidates) {
            when (backend.querySuspensionState(pkg)) {
                PackageSuspensionState.SUSPENDED -> add(pkg)
                PackageSuspensionState.NOT_SUSPENDED -> Unit
                PackageSuspensionState.UNKNOWN -> if (pkg in tracked) add(pkg)
            }
        }
    }
}
