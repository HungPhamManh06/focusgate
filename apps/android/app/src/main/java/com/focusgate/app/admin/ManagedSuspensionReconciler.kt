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

        // Re-reconcile ALL packages that were tracked, targeted, or touched by DPM
        // (including packages DPM reported as unsuspendedOk or suspendedOk) so
        // API lies or silent OS failures are always caught.
        val involvedPackages = tracked +
            before.trackedPackages +
            target +
            toUnsuspend +
            toSuspend +
            failedToUnsuspend +
            failedToSuspend
        val ownerStillValid = backend.isDeviceOwner()
        val after = if (ownerStillValid) {
            reconcile(involvedPackages, target, backend)
        } else {
            val unverified = involvedPackages + target
            ManagedSuspensionSnapshot(
                verifiedSuspended = emptySet(),
                verifiedNotSuspended = emptySet(),
                unknownState = unverified,
                trackedPackages = unverified,
            )
        }
        backend.saveTrackedSuspended(after.trackedPackages)

        val unknownList = after.unknownState.toList().sorted()
        val remainingMissing = target - after.verifiedSuspended - after.unknownState
        val remainingExtra = after.verifiedSuspended - target

        // Final OS state after reconciliation is the primary source of truth.
        // `applied` is true ONLY when Device Owner is valid, all required
        // packages are verified SUSPENDED, no extra packages remain suspended,
        // and no involved package is UNKNOWN.
        val exactMatch = ownerStillValid &&
            remainingMissing.isEmpty() &&
            remainingExtra.isEmpty() &&
            unknownList.isEmpty()

        val effectiveFailedToSuspend = if (exactMatch) {
            emptyList()
        } else {
            (toSuspend.intersect(remainingMissing + after.unknownState) +
                failedToSuspend.intersect(remainingMissing + after.unknownState)).distinct().sorted()
        }
        val effectiveFailedToUnsuspend = if (exactMatch) {
            emptyList()
        } else {
            (toUnsuspend.intersect(remainingExtra + after.unknownState) +
                failedToUnsuspend.intersect(remainingExtra + after.unknownState)).distinct().sorted()
        }

        val exceptionMsg = securityError?.let { it.message ?: "SecurityException" }
        val allFailures = if (exactMatch) {
            emptyList()
        } else {
            buildList {
                addAll((effectiveFailedToSuspend + effectiveFailedToUnsuspend).distinct().sorted())
                if (exceptionMsg != null && isEmpty()) {
                    add(exceptionMsg)
                }
            }
        }

        val message = when {
            exactMatch -> "Managed policy verified and applied to ${after.verifiedSuspended.size} app(s)."
            !ownerStillValid -> "Device Owner permission was lost during policy update."
            securityError != null -> buildString {
                append("Android rejected part of the managed policy update.")
                if (unknownList.isNotEmpty()) {
                    append(" ${unknownList.size} app(s) could not be verified.")
                }
            }
            effectiveFailedToSuspend.isNotEmpty() && effectiveFailedToUnsuspend.isNotEmpty() ->
                "${effectiveFailedToSuspend.size} app(s) could not be suspended and " +
                    "${effectiveFailedToUnsuspend.size} could not be resumed."
            effectiveFailedToSuspend.isNotEmpty() ->
                "${effectiveFailedToSuspend.size} app(s) could not be suspended."
            effectiveFailedToUnsuspend.isNotEmpty() ->
                "${effectiveFailedToUnsuspend.size} app(s) could not be resumed."
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
            failedToSuspend = effectiveFailedToSuspend,
            failedToUnsuspend = effectiveFailedToUnsuspend,
            unknownPackages = unknownList,
            exceptionMessage = exceptionMsg,
        )
    }

    fun clearSuspensions(backend: ManagedSuspensionBackend): ManagedApplyResult {
        if (!backend.isDeviceOwner()) {
            val tracked = backend.loadTrackedSuspended()
            return ManagedApplyResult(
                applied = false,
                suspendedPackages = 0,
                failures = emptyList(),
                message = "Not a Device Owner.",
                unknownPackages = tracked.toList().sorted(),
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

        // Re-reconcile ALL packages in toClear/tracked regardless of whether DPM
        // reported success or failure, and only drop packages verified NOT_SUSPENDED.
        val involvedPackages = tracked + toClear + failedToUnsuspend
        val ownerStillValid = backend.isDeviceOwner()
        val after = if (ownerStillValid) {
            reconcile(involvedPackages, emptySet(), backend)
        } else {
            ManagedSuspensionSnapshot(
                verifiedSuspended = emptySet(),
                verifiedNotSuspended = emptySet(),
                unknownState = involvedPackages,
                trackedPackages = involvedPackages,
            )
        }
        backend.saveTrackedSuspended(after.trackedPackages)

        val unknownList = after.unknownState.toList().sorted()
        val cleared = ownerStillValid &&
            after.verifiedSuspended.isEmpty() &&
            after.unknownState.isEmpty() &&
            after.trackedPackages.isEmpty()

        val effectiveFailedToUnsuspend = if (cleared) {
            emptyList()
        } else {
            (involvedPackages.intersect(after.verifiedSuspended + after.unknownState)).toList().sorted()
        }

        val exceptionMsg = securityError?.let { it.message ?: "SecurityException" }
        val allFailures = if (cleared) {
            emptyList()
        } else {
            buildList {
                addAll(effectiveFailedToUnsuspend)
                if (exceptionMsg != null && isEmpty()) {
                    add(exceptionMsg)
                }
            }
        }

        return ManagedApplyResult(
            applied = cleared,
            suspendedPackages = after.verifiedSuspended.size,
            failures = allFailures,
            message = when {
                cleared -> "All managed suspensions removed."
                !ownerStillValid -> "Device Owner permission was lost while resuming apps."
                securityError != null -> "Android rejected the request to resume suspended apps."
                effectiveFailedToUnsuspend.isNotEmpty() ->
                    "${effectiveFailedToUnsuspend.size} app(s) could not be resumed."
                unknownList.isNotEmpty() ->
                    "${unknownList.size} app(s) could not be verified after resuming."
                else -> "Some apps remain suspended."
            },
            failedToUnsuspend = effectiveFailedToUnsuspend,
            unknownPackages = unknownList,
            exceptionMessage = exceptionMsg,
        )
    }
}
