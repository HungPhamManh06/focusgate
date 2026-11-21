package com.focusgate.app.policy

/** The status shown to the user. It must never overstate protection. */
enum class ProtectionLevel {
    PROTECTED,
    DEGRADED,
    OFF,
}

data class ProtectionSnapshot(
    val level: ProtectionLevel,
    val issues: List<String>,
    val personalModeReady: Boolean,
    val managedModeReady: Boolean,
    val hasUnsavedChanges: Boolean = false,
)

/**
 * Pure status calculation. Protection level is ALWAYS derived from the saved
 * and applied policy — never from unsaved pending UI edits.
 *
 * A personal-mode device is protected only when: monitoring is enabled, at
 * least one app is restricted in the saved policy, Usage Access is granted,
 * overlay access is granted, the foreground service is running, and the
 * monitor has loaded the saved policy.
 *
 * Managed Device mode uses device-owner package suspension, so it does not
 * depend on Usage Access or overlay access, but every saved restricted app
 * must actually be suspended. Emergency access always degrades the status
 * while it is active, because restrictions are temporarily paused.
 */
object ProtectionEvaluator {

    fun evaluate(
        monitorEnabled: Boolean,
        restrictedAppCount: Int,
        usageAccess: Boolean,
        overlayAccess: Boolean,
        serviceRunning: Boolean,
        managedEnforced: Boolean,
        emergencyActive: Boolean,
        managedUnsuspendedCount: Int = 0,
        hasUnsavedChanges: Boolean = false,
        monitorPolicySynced: Boolean = true,
    ): ProtectionSnapshot {
        if (!monitorEnabled || restrictedAppCount == 0) {
            return ProtectionSnapshot(
                level = ProtectionLevel.OFF,
                issues = buildList {
                    if (!monitorEnabled) add("Protection is turned off")
                    if (restrictedAppCount == 0) add("No apps are restricted")
                },
                personalModeReady = false,
                managedModeReady = false,
                hasUnsavedChanges = hasUnsavedChanges,
            )
        }

        if (emergencyActive) {
            return ProtectionSnapshot(
                level = ProtectionLevel.DEGRADED,
                issues = listOf("Emergency access is active"),
                personalModeReady = false,
                managedModeReady = false,
                hasUnsavedChanges = hasUnsavedChanges,
            )
        }

        if (managedEnforced) {
            // Device Owner mode is only "Protected" when every saved restricted
            // app is actually suspended; a partial apply must not look complete.
            if (managedUnsuspendedCount > 0) {
                return ProtectionSnapshot(
                    level = ProtectionLevel.DEGRADED,
                    issues = listOf("$managedUnsuspendedCount restricted app(s) are not suspended"),
                    personalModeReady = false,
                    managedModeReady = false,
                    hasUnsavedChanges = hasUnsavedChanges,
                )
            }
            return ProtectionSnapshot(
                level = ProtectionLevel.PROTECTED,
                issues = emptyList(),
                personalModeReady = false,
                managedModeReady = true,
                hasUnsavedChanges = hasUnsavedChanges,
            )
        }

        val issues = buildList {
            if (!usageAccess) add("Usage Access is missing")
            if (!overlayAccess) add("Display over other apps is missing")
            if (!serviceRunning) add("Monitoring service is not running")
            if (serviceRunning && !monitorPolicySynced) add("Monitoring service is syncing saved policy")
        }

        val ready = issues.isEmpty()
        return ProtectionSnapshot(
            level = if (ready) ProtectionLevel.PROTECTED else ProtectionLevel.DEGRADED,
            issues = issues,
            personalModeReady = ready,
            managedModeReady = false,
            hasUnsavedChanges = hasUnsavedChanges,
        )
    }
}
