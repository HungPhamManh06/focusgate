package com.focusgate.app.admin

enum class EmergencyPresentationState {
    NORMAL_PROTECTION,
    EMERGENCY_ACTIVE,
    EMERGENCY_ACTIVE_DEGRADED,
    EMERGENCY_FAILED,
}

data class EmergencyStatusPresentation(
    val state: EmergencyPresentationState,
    val suspendedCount: Int = 0,
    val unknownCount: Int = 0,
    val message: String,
    val needsRecoveryRetry: Boolean = false,
)

/**
 * Pure presentation logic for Emergency Access notifications and UI banners.
 *
 * Never claims all restrictions are cleared if managed suspensions remain
 * SUSPENDED or UNKNOWN, or if the coordinator transition failed.
 */
object EmergencyStatusEvaluator {

    fun evaluate(outcome: PolicyOperationOutcome?): EmergencyStatusPresentation {
        if (outcome == null || !outcome.state.emergencyActive) {
            return failed(outcome?.bannerMessage)
        }
        return evaluateState(
            emergencyActive = outcome.state.emergencyActive,
            audit = outcome.audit,
            deviceOwner = outcome.state.deviceOwner,
            managedEnabled = outcome.state.managedEnabled,
            applyResult = outcome.applyResult,
        )
    }

    fun evaluateState(
        emergencyActive: Boolean,
        audit: ManagedPolicyAudit,
        deviceOwner: Boolean,
        managedEnabled: Boolean,
        applyResult: ManagedApplyResult? = null,
    ): EmergencyStatusPresentation {
        if (!emergencyActive) {
            return EmergencyStatusPresentation(
                state = EmergencyPresentationState.NORMAL_PROTECTION,
                message = "Monitoring is active",
            )
        }

        val suspendedCount = audit.verifiedSuspended.size
        val unknownCount = audit.unknownPackages.size
        val applyFailed = applyResult != null && !applyResult.applied
        val ownerLostWithTracked = !deviceOwner &&
            (managedEnabled || audit.trackedPackages.isNotEmpty() || unknownCount > 0)

        if (suspendedCount > 0 || unknownCount > 0 || applyFailed || ownerLostWithTracked) {
            val detail = buildList {
                if (suspendedCount > 0) add("$suspendedCount app(s) still suspended")
                if (unknownCount > 0) add("$unknownCount app(s) unknown")
                if (!deviceOwner && ownerLostWithTracked) add("Device Owner lost")
            }.joinToString(", ")

            val message = if (detail.isNotEmpty()) {
                "Emergency access started, but some apps could not be restored ($detail). Protection is degraded."
            } else {
                "Emergency access started, but some apps could not be restored. Protection is degraded."
            }
            return EmergencyStatusPresentation(
                state = EmergencyPresentationState.EMERGENCY_ACTIVE_DEGRADED,
                suspendedCount = suspendedCount,
                unknownCount = unknownCount,
                message = message,
                needsRecoveryRetry = true,
            )
        }

        return EmergencyStatusPresentation(
            state = EmergencyPresentationState.EMERGENCY_ACTIVE,
            suspendedCount = 0,
            unknownCount = 0,
            message = "Emergency access is active. Restrictions are paused.",
            needsRecoveryRetry = false,
        )
    }

    fun failed(reason: String? = null): EmergencyStatusPresentation {
        val message = if (reason.isNullOrBlank()) {
            "Could not verify emergency access. Some restrictions may still apply."
        } else {
            "Could not verify emergency access: $reason"
        }
        return EmergencyStatusPresentation(
            state = EmergencyPresentationState.EMERGENCY_FAILED,
            message = message,
            needsRecoveryRetry = true,
        )
    }
}
