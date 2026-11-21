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
    val managedMissingCount: Int = 0,
    val managedExtraSuspendedCount: Int = 0,
    val managedUnknownCount: Int = 0,
    val needsManagedRestore: Boolean = false,
)

/**
 * Pure status calculation. Protection level is ALWAYS derived from the saved
 * and verified policy — never from unsaved pending UI edits or unverified
 * local tracking alone.
 *
 * Managed Device Mode is `PROTECTED` ONLY when:
 * 1. Every required app is verified suspended (`managedUnsuspendedCount == 0`).
 * 2. No extra app outside the policy remains suspended (`managedExtraSuspendedCount == 0`).
 * 3. No package has an `UNKNOWN` OS state (`managedUnknownCount == 0`).
 * 4. Device Owner is valid (`!managedDeviceOwnerLost`).
 * 5. Emergency access is not active (`!emergencyActive`).
 *
 * If the policy is empty or monitoring is off, but FocusGate still has
 * suspended or unverified apps, status is `DEGRADED` (not `OFF`) so the user
 * is warned to restore them.
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
        managedExtraSuspendedCount: Int = 0,
        managedUnknownCount: Int = 0,
        managedDeviceOwnerLost: Boolean = false,
        hasUnsavedChanges: Boolean = false,
        monitorPolicySynced: Boolean = true,
    ): ProtectionSnapshot {
        val hasLingeringManaged = managedExtraSuspendedCount > 0 || managedUnknownCount > 0

        if (!monitorEnabled || restrictedAppCount == 0) {
            if (hasLingeringManaged) {
                val issues = buildList {
                    if (managedExtraSuspendedCount > 0) {
                        add("$managedExtraSuspendedCount app(s) are still suspended and need to be restored")
                    }
                    if (managedUnknownCount > 0) {
                        add("$managedUnknownCount app(s) have an unverified suspension state")
                    }
                    if (managedDeviceOwnerLost) {
                        add("Device Owner permission is missing")
                    }
                }
                return ProtectionSnapshot(
                    level = ProtectionLevel.DEGRADED,
                    issues = issues,
                    personalModeReady = false,
                    managedModeReady = false,
                    hasUnsavedChanges = hasUnsavedChanges,
                    managedMissingCount = 0,
                    managedExtraSuspendedCount = managedExtraSuspendedCount,
                    managedUnknownCount = managedUnknownCount,
                    needsManagedRestore = true,
                )
            }
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
            val issues = buildList {
                add("Emergency access is active")
                if (managedExtraSuspendedCount > 0) {
                    add("$managedExtraSuspendedCount app(s) could not be resumed")
                }
                if (managedUnknownCount > 0) {
                    add("$managedUnknownCount app(s) have an unverified suspension state")
                }
            }
            return ProtectionSnapshot(
                level = ProtectionLevel.DEGRADED,
                issues = issues,
                personalModeReady = false,
                managedModeReady = false,
                hasUnsavedChanges = hasUnsavedChanges,
                managedMissingCount = managedUnsuspendedCount,
                managedExtraSuspendedCount = managedExtraSuspendedCount,
                managedUnknownCount = managedUnknownCount,
                needsManagedRestore = hasLingeringManaged,
            )
        }

        if (managedDeviceOwnerLost) {
            val issues = buildList {
                add("Device Owner permission was lost")
                if (managedUnknownCount > 0) {
                    add("$managedUnknownCount app(s) cannot be verified without Device Owner")
                }
            }
            return ProtectionSnapshot(
                level = ProtectionLevel.DEGRADED,
                issues = issues,
                personalModeReady = false,
                managedModeReady = false,
                hasUnsavedChanges = hasUnsavedChanges,
                managedMissingCount = managedUnsuspendedCount,
                managedExtraSuspendedCount = managedExtraSuspendedCount,
                managedUnknownCount = managedUnknownCount,
            )
        }

        if (managedEnforced) {
            val issues = buildList {
                if (managedUnsuspendedCount > 0) {
                    add("$managedUnsuspendedCount required app(s) are not suspended")
                }
                if (managedExtraSuspendedCount > 0) {
                    add("$managedExtraSuspendedCount extra app(s) are still suspended outside the policy")
                }
                if (managedUnknownCount > 0) {
                    add("$managedUnknownCount app(s) have an unverified suspension state")
                }
            }
            if (issues.isNotEmpty()) {
                return ProtectionSnapshot(
                    level = ProtectionLevel.DEGRADED,
                    issues = issues,
                    personalModeReady = false,
                    managedModeReady = false,
                    hasUnsavedChanges = hasUnsavedChanges,
                    managedMissingCount = managedUnsuspendedCount,
                    managedExtraSuspendedCount = managedExtraSuspendedCount,
                    managedUnknownCount = managedUnknownCount,
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
            if (managedExtraSuspendedCount > 0) {
                add("$managedExtraSuspendedCount app(s) are still suspended by Managed Mode and need to be restored")
            }
            if (managedUnknownCount > 0) {
                add("$managedUnknownCount managed app(s) have an unverified suspension state")
            }
            if (!usageAccess) add("Usage Access is missing")
            if (!overlayAccess) add("Display over other apps is missing")
            if (!serviceRunning) add("Monitoring service is not running")
            if (serviceRunning && !monitorPolicySynced) add("Monitoring service is syncing saved policy")
        }

        // Personal Mode cannot claim Protected while managed suspensions or
        // unverified managed packages remain active on the device.
        val ready = issues.isEmpty() && !hasLingeringManaged
        return ProtectionSnapshot(
            level = if (ready) ProtectionLevel.PROTECTED else ProtectionLevel.DEGRADED,
            issues = issues,
            personalModeReady = ready,
            managedModeReady = false,
            hasUnsavedChanges = hasUnsavedChanges,
            managedMissingCount = 0,
            managedExtraSuspendedCount = managedExtraSuspendedCount,
            managedUnknownCount = managedUnknownCount,
            needsManagedRestore = hasLingeringManaged,
        )
    }
}
