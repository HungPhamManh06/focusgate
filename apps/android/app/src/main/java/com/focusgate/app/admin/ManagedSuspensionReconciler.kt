package com.focusgate.app.admin

import com.focusgate.app.policy.PolicyEvaluator

enum class PackageSuspensionState {
    SUSPENDED,
    NOT_SUSPENDED,
    UNKNOWN,
}

/**
 * Verified OS suspension snapshot separated from local recovery tracking.
 *
 * `unknownState` packages are NEVER included in `verifiedSuspended`, so an
 * unverified package can never cause Protection Status to report Protected.
 * Local `trackedPackages` still retains tracked-unknown packages so FocusGate
 * can retry or restore them when DevicePolicyManager recovers.
 */
data class ManagedSuspensionSnapshot(
    val verifiedSuspended: Set<String> = emptySet(),
    val verifiedNotSuspended: Set<String> = emptySet(),
    val unknownState: Set<String> = emptySet(),
    val trackedPackages: Set<String> = emptySet(),
)

/**
 * Two-way audit comparing the required saved policy against verified OS state.
 */
data class ManagedPolicyAudit(
    val requiredNotSuspended: Set<String> = emptySet(),
    val extraSuspended: Set<String> = emptySet(),
    val unknownPackages: Set<String> = emptySet(),
    val verifiedSuspended: Set<String> = emptySet(),
    val trackedPackages: Set<String> = emptySet(),
    val deviceOwnerValid: Boolean = true,
) {
    val isExactMatch: Boolean
        get() = deviceOwnerValid &&
            requiredNotSuspended.isEmpty() &&
            extraSuspended.isEmpty() &&
            unknownPackages.isEmpty()

    val hasLingeringSuspensions: Boolean
        get() = extraSuspended.isNotEmpty() ||
            verifiedSuspended.isNotEmpty() ||
            unknownPackages.isNotEmpty()
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
 * Keeps suspend failures, unsuspend failures, verified OS state, and unknown
 * state strictly separate, and re-reconciles actual OS state after partial
 * SecurityExceptions so earlier successful steps are never overwritten by a
 * stale pre-operation snapshot.
 */
object ManagedSuspensionReconciler {

    fun reconcile(
        tracked: Set<String>,
        candidates: Set<String>,
        backend: ManagedSuspensionBackend,
    ): ManagedSuspensionSnapshot {
        val verifiedSuspended = mutableSetOf<String>()
        val verifiedNotSuspended = mutableSetOf<String>()
        val unknownState = mutableSetOf<String>()

        for (pkg in tracked + candidates) {
            when (backend.querySuspensionState(pkg)) {
                PackageSuspensionState.SUSPENDED -> verifiedSuspended.add(pkg)
                PackageSuspensionState.NOT_SUSPENDED -> verifiedNotSuspended.add(pkg)
                PackageSuspensionState.UNKNOWN -> unknownState.add(pkg)
            }
        }

        // Recovery tracking keeps verified suspended packages PLUS tracked
        // packages whose state could not be verified, never dropping them.
        val nextTracked = verifiedSuspended + unknownState.intersect(tracked)
        return ManagedSuspensionSnapshot(
            verifiedSuspended = verifiedSuspended,
            verifiedNotSuspended = verifiedNotSuspended,
            unknownState = unknownState,
            trackedPackages = nextTracked,
        )
    }

    fun auditPolicy(
        requiredPackages: Set<String>,
        backend: ManagedSuspensionBackend,
    ): ManagedPolicyAudit {
        val tracked = backend.loadTrackedSuspended()
        if (!backend.isDeviceOwner()) {
            // Without Device Owner we cannot verify OS suspension state.
            val unverified = requiredPackages + tracked
            return ManagedPolicyAudit(
                requiredNotSuspended = emptySet(),
                extraSuspended = emptySet(),
                unknownPackages = unverified,
                verifiedSuspended = emptySet(),
                trackedPackages = tracked,
                deviceOwnerValid = false,
            )
        }

        val snapshot = reconcile(tracked, requiredPackages, backend)
        val requiredNotSuspended = requiredPackages - snapshot.verifiedSuspended - snapshot.unknownState
        val extraSuspended = snapshot.verifiedSuspended - requiredPackages

        return ManagedPolicyAudit(
            requiredNotSuspended = requiredNotSuspended,
            extraSuspended = extraSuspended,
            unknownPackages = snapshot.unknownState,
            verifiedSuspended = snapshot.verifiedSuspended,
            trackedPackages = snapshot.trackedPackages,
            deviceOwnerValid = true,
        )
    }

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
        val before = reconcile(tracked, target, backend)

        // Include tracked-unknown packages outside target so recovery unsuspends
        // them as soon as DPM accepts calls again.
        val toUnsuspend = before.trackedPackages - target
        // Include verified-not-suspended AND unknown target packages so recovery
        // attempts to suspend them.
        val toSuspend = target - before.verifiedSuspended

        var failedToUnsuspend = emptySet<String>()
        var unsuspendedOk = emptySet<String>()
        var failedToSuspend = emptySet<String>()
        var suspendedOk = emptySet<String>()
        var securityError: SecurityException? = null

        try {
            if (toUnsuspend.isNotEmpty()) {
                failedToUnsuspend = backend.setPackagesSuspended(toUnsuspend, suspended = false)
                unsuspendedOk = toUnsuspend - failedToUnsuspend
            }
            if (toSuspend.isNotEmpty()) {
                failedToSuspend = backend.setPackagesSuspended(toSuspend, suspended = true)
                suspendedOk = toSuspend - failedToSuspend
            }
        } catch (exception: SecurityException) {
            securityError = exception
            // Distinguish which step failed: if unsuspend already completed
            // (unsuspendedOk populated or toUnsuspend empty), only toSuspend
            // failed in the second call; otherwise unsuspend itself threw.
            if (toUnsuspend.isNotEmpty() && unsuspendedOk.isEmpty() && failedToUnsuspend.isEmpty()) {
                failedToUnsuspend = toUnsuspend
                failedToSuspend = toSuspend
            } else {
                failedToSuspend = toSuspend
            }
        }

        // Re-reconcile against actual OS state after operations (including after
        // a partial SecurityException) so earlier successful steps are preserved
        // and unverified packages remain tracked for recovery.
        val candidateTracked = (before.trackedPackages - unsuspendedOk) +
            suspendedOk +
            failedToUnsuspend
        val after = reconcile(candidateTracked, target, backend)
        backend.saveTrackedSuspended(after.trackedPackages)

        val suspendFailList = failedToSuspend.toList().sorted()
        val unsuspendFailList = failedToUnsuspend.toList().sorted()
        val unknownList = after.unknownState.toList().sorted()

        val remainingMissing = target - after.verifiedSuspended - after.unknownState
        val remainingExtra = after.verifiedSuspended - target

        val exactMatch = securityError == null &&
            suspendFailList.isEmpty() &&
            unsuspendFailList.isEmpty() &&
            remainingMissing.isEmpty() &&
            remainingExtra.isEmpty() &&
            unknownList.isEmpty()

        val allFailures = buildList {
            addAll((failedToSuspend + failedToUnsuspend).sorted())
            if (securityError != null && isEmpty()) {
                add(securityError.message ?: "SecurityException")
            }
        }

        val message = when {
            exactMatch -> "Managed policy verified and applied to ${after.verifiedSuspended.size} app(s)."
            securityError != null -> buildString {
                append("Android rejected part of the managed policy update.")
                if (unknownList.isNotEmpty()) {
                    append(" ${unknownList.size} app(s) could not be verified.")
                }
            }
            suspendFailList.isNotEmpty() && unsuspendFailList.isNotEmpty() ->
                "${suspendFailList.size} app(s) could not be suspended and " +
                    "${unsuspendFailList.size} could not be resumed."
            suspendFailList.isNotEmpty() ->
                "${suspendFailList.size} app(s) could not be suspended."
            unsuspendFailList.isNotEmpty() ->
                "${unsuspendFailList.size} app(s) could not be resumed."
            unknownList.isNotEmpty() ->
                "${unknownList.size} app(s) could not be verified with DevicePolicyManager."
            remainingMissing.isNotEmpty() || remainingExtra.isNotEmpty() ->
                "Managed policy state does not match the saved policy."
            else -> "Managed policy update incomplete."
        }

        return ManagedApplyResult(
            applied = exactMatch,
            suspendedPackages = after.verifiedSuspended.size,
            failures = allFailures,
            message = message,
            failedToSuspend = suspendFailList,
            failedToUnsuspend = unsuspendFailList,
            unknownPackages = unknownList,
        )
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
        val before = reconcile(tracked, emptySet(), backend)
        val toClear = before.trackedPackages
        if (toClear.isEmpty()) {
            if (tracked.isNotEmpty()) backend.saveTrackedSuspended(emptySet())
            return ManagedApplyResult(
                applied = true,
                suspendedPackages = 0,
                failures = emptyList(),
                message = "No managed suspensions to clear.",
            )
        }

        var failedToUnsuspend = emptySet<String>()
        var unsuspendedOk = emptySet<String>()
        var securityError: SecurityException? = null

        try {
            failedToUnsuspend = backend.setPackagesSuspended(toClear, suspended = false)
            unsuspendedOk = toClear - failedToUnsuspend
        } catch (exception: SecurityException) {
            securityError = exception
            failedToUnsuspend = toClear
        }

        val candidateTracked = (toClear - unsuspendedOk) + failedToUnsuspend
        val after = reconcile(candidateTracked, emptySet(), backend)
        backend.saveTrackedSuspended(after.trackedPackages)

        val unsuspendFailList = failedToUnsuspend.toList().sorted()
        val unknownList = after.unknownState.toList().sorted()
        val cleared = securityError == null &&
            unsuspendFailList.isEmpty() &&
            after.verifiedSuspended.isEmpty() &&
            unknownList.isEmpty()

        val allFailures = buildList {
            addAll(unsuspendFailList)
            if (securityError != null && isEmpty()) {
                add(securityError.message ?: "SecurityException")
            }
        }

        return ManagedApplyResult(
            applied = cleared,
            suspendedPackages = after.verifiedSuspended.size,
            failures = allFailures,
            message = when {
                cleared -> "All managed suspensions removed."
                securityError != null -> "Android rejected the request to resume suspended apps."
                unsuspendFailList.isNotEmpty() -> "${unsuspendFailList.size} app(s) could not be resumed."
                unknownList.isNotEmpty() -> "${unknownList.size} app(s) could not be verified after resuming."
                else -> "Some apps remain suspended."
            },
            failedToUnsuspend = unsuspendFailList,
            unknownPackages = unknownList,
        )
    }
}
