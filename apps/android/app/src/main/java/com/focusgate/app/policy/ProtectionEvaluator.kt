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
)

/**
 * Pure status calculation. A personal-mode device is protected only when:
 * monitoring is enabled, at least one app is restricted, Usage Access is
 * granted, overlay access is granted and the foreground service is running.
 *
 * Managed Device mode uses device-owner package suspension, so it does not
 * depend on Usage Access or overlay access. Emergency access always degrades
 * the status while it is active, because restrictions are temporarily paused.
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
            )
        }

        if (emergencyActive) {
            return ProtectionSnapshot(
                level = ProtectionLevel.DEGRADED,
                issues = listOf("Emergency access is active"),
                personalModeReady = false,
                managedModeReady = false,
            )
        }

        if (managedEnforced) {
            return ProtectionSnapshot(
                level = ProtectionLevel.PROTECTED,
                issues = emptyList(),
                personalModeReady = false,
                managedModeReady = true,
            )
        }

        val issues = buildList {
            if (!usageAccess) add("Usage Access is missing")
            if (!overlayAccess) add("Display over other apps is missing")
            if (!serviceRunning) add("Monitoring service is not running")
        }

        val ready = issues.isEmpty()
        return ProtectionSnapshot(
            level = if (ready) ProtectionLevel.PROTECTED else ProtectionLevel.DEGRADED,
            issues = issues,
            personalModeReady = ready,
            managedModeReady = false,
        )
    }
}
