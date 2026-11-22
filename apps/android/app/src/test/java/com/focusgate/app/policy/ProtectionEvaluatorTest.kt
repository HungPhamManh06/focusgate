package com.focusgate.app.policy

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ProtectionEvaluatorTest {

    @Test
    fun `off when monitoring is disabled`() {
        val result = ProtectionEvaluator.evaluate(
            monitorEnabled = false,
            restrictedAppCount = 2,
            usageAccess = true,
            overlayAccess = true,
            serviceRunning = true,
            managedEnforced = false,
            emergencyActive = false,
        )
        assertEquals(ProtectionLevel.OFF, result.level)
        assertTrue(result.issues.any { it.contains("turned off") })
    }

    @Test
    fun `off when no apps are restricted`() {
        val result = ProtectionEvaluator.evaluate(
            monitorEnabled = true,
            restrictedAppCount = 0,
            usageAccess = true,
            overlayAccess = true,
            serviceRunning = true,
            managedEnforced = false,
            emergencyActive = false,
        )
        assertEquals(ProtectionLevel.OFF, result.level)
    }

    @Test
    fun `degraded when usage access is missing`() {
        val result = ProtectionEvaluator.evaluate(
            monitorEnabled = true,
            restrictedAppCount = 1,
            usageAccess = false,
            overlayAccess = true,
            serviceRunning = true,
            managedEnforced = false,
            emergencyActive = false,
        )
        assertEquals(ProtectionLevel.DEGRADED, result.level)
        assertTrue(result.issues.any { it.contains("Usage Access") })
    }

    @Test
    fun `degraded when overlay access is missing`() {
        val result = ProtectionEvaluator.evaluate(
            monitorEnabled = true,
            restrictedAppCount = 1,
            usageAccess = true,
            overlayAccess = false,
            serviceRunning = true,
            managedEnforced = false,
            emergencyActive = false,
        )
        assertEquals(ProtectionLevel.DEGRADED, result.level)
    }

    @Test
    fun `protected when personal mode is fully ready`() {
        val result = ProtectionEvaluator.evaluate(
            monitorEnabled = true,
            restrictedAppCount = 1,
            usageAccess = true,
            overlayAccess = true,
            serviceRunning = true,
            managedEnforced = false,
            emergencyActive = false,
        )
        assertEquals(ProtectionLevel.PROTECTED, result.level)
        assertTrue(result.personalModeReady)
    }

    @Test
    fun `managed mode does not require usage or overlay access`() {
        val result = ProtectionEvaluator.evaluate(
            monitorEnabled = true,
            restrictedAppCount = 1,
            usageAccess = false,
            overlayAccess = false,
            serviceRunning = false,
            managedEnforced = true,
            emergencyActive = false,
        )
        assertEquals(ProtectionLevel.PROTECTED, result.level)
        assertTrue(result.managedModeReady)
    }

    @Test
    fun `emergency access degrades status`() {
        val result = ProtectionEvaluator.evaluate(
            monitorEnabled = true,
            restrictedAppCount = 1,
            usageAccess = true,
            overlayAccess = true,
            serviceRunning = true,
            managedEnforced = true,
            emergencyActive = true,
        )
        assertEquals(ProtectionLevel.DEGRADED, result.level)
    }

    @Test
    fun `degraded when the monitoring service is not running`() {
        val result = ProtectionEvaluator.evaluate(
            monitorEnabled = true,
            restrictedAppCount = 1,
            usageAccess = true,
            overlayAccess = true,
            serviceRunning = false,
            managedEnforced = false,
            emergencyActive = false,
        )
        assertEquals(ProtectionLevel.DEGRADED, result.level)
        assertTrue(result.issues.any { it.contains("service") })
    }

    @Test
    fun `managed mode with unsuspended apps is degraded, not protected`() {
        val result = ProtectionEvaluator.evaluate(
            monitorEnabled = true,
            restrictedAppCount = 3,
            usageAccess = false,
            overlayAccess = false,
            serviceRunning = false,
            managedEnforced = true,
            emergencyActive = false,
            managedUnsuspendedCount = 1,
        )
        assertEquals(ProtectionLevel.DEGRADED, result.level)
        assertTrue(result.issues.any { it.contains("not suspended") })
    }

    @Test
    fun `unsaved pending selection never causes Protected when saved policy is empty`() {
        val result = ProtectionEvaluator.evaluate(
            monitorEnabled = true,
            restrictedAppCount = 0, // saved policy still empty
            usageAccess = true,
            overlayAccess = true,
            serviceRunning = true,
            managedEnforced = true,
            emergencyActive = false,
            managedUnsuspendedCount = 0,
            hasUnsavedChanges = true,
        )
        assertEquals(ProtectionLevel.OFF, result.level)
        assertTrue(result.hasUnsavedChanges)
    }

    @Test
    fun `unsaved changes flag is surfaced while protection reflects saved policy`() {
        val result = ProtectionEvaluator.evaluate(
            monitorEnabled = true,
            restrictedAppCount = 2,
            usageAccess = true,
            overlayAccess = true,
            serviceRunning = true,
            managedEnforced = false,
            emergencyActive = false,
            hasUnsavedChanges = true,
        )
        assertEquals(ProtectionLevel.PROTECTED, result.level)
        assertTrue(result.hasUnsavedChanges)
    }

    @Test
    fun `personal mode is degraded while monitor service policy is out of sync`() {
        val result = ProtectionEvaluator.evaluate(
            monitorEnabled = true,
            restrictedAppCount = 2,
            usageAccess = true,
            overlayAccess = true,
            serviceRunning = true,
            managedEnforced = false,
            emergencyActive = false,
            monitorPolicySynced = false,
        )
        assertEquals(ProtectionLevel.DEGRADED, result.level)
        assertTrue(result.issues.any { it.contains("syncing") })
    }

    @Test
    fun `managed mode with extra suspended apps outside policy is Degraded`() {
        val result = ProtectionEvaluator.evaluate(
            monitorEnabled = true,
            restrictedAppCount = 1,
            usageAccess = false,
            overlayAccess = false,
            serviceRunning = false,
            managedEnforced = true,
            emergencyActive = false,
            managedUnsuspendedCount = 0,
            managedExtraSuspendedCount = 1,
        )
        assertEquals(ProtectionLevel.DEGRADED, result.level)
        assertEquals(1, result.managedExtraSuspendedCount)
        assertTrue(result.issues.any { it.contains("extra") })
    }

    @Test
    fun `managed mode with unknown packages is Degraded, never Protected`() {
        val result = ProtectionEvaluator.evaluate(
            monitorEnabled = true,
            restrictedAppCount = 2,
            usageAccess = false,
            overlayAccess = false,
            serviceRunning = false,
            managedEnforced = true,
            emergencyActive = false,
            managedUnknownCount = 1,
        )
        assertEquals(ProtectionLevel.DEGRADED, result.level)
        assertEquals(1, result.managedUnknownCount)
        assertTrue(result.issues.any { it.contains("unverified") })
    }

    @Test
    fun `empty policy with lingering suspended apps reports Degraded with restore flag`() {
        val result = ProtectionEvaluator.evaluate(
            monitorEnabled = false,
            restrictedAppCount = 0,
            usageAccess = false,
            overlayAccess = false,
            serviceRunning = false,
            managedEnforced = false,
            emergencyActive = false,
            managedExtraSuspendedCount = 2,
        )
        assertEquals(ProtectionLevel.DEGRADED, result.level)
        assertTrue(result.needsManagedRestore)
        assertTrue(result.issues.any { it.contains("restored") })
    }

    @Test
    fun `lost Device Owner reports Degraded`() {
        val result = ProtectionEvaluator.evaluate(
            monitorEnabled = true,
            restrictedAppCount = 2,
            usageAccess = false,
            overlayAccess = false,
            serviceRunning = false,
            managedEnforced = false,
            emergencyActive = false,
            managedUnknownCount = 2,
            managedDeviceOwnerLost = true,
        )
        assertEquals(ProtectionLevel.DEGRADED, result.level)
        assertTrue(result.issues.any { it.contains("Device Owner") })
    }

    @Test
    fun `personal mode cannot report Protected when lingering managed suspensions remain`() {
        val result = ProtectionEvaluator.evaluate(
            monitorEnabled = true,
            restrictedAppCount = 2,
            usageAccess = true,
            overlayAccess = true,
            serviceRunning = true,
            managedEnforced = false,
            emergencyActive = false,
            managedExtraSuspendedCount = 1,
            managedUnknownCount = 0,
        )
        assertEquals(ProtectionLevel.DEGRADED, result.level)
        assertEquals(false, result.personalModeReady)
        assertTrue(result.needsManagedRestore)
        assertEquals(1, result.managedExtraSuspendedCount)
        assertTrue(result.issues.any { it.contains("Managed Mode") })
    }

    @Test
    fun `personal mode cannot report Protected when unverified managed packages remain`() {
        val result = ProtectionEvaluator.evaluate(
            monitorEnabled = true,
            restrictedAppCount = 2,
            usageAccess = true,
            overlayAccess = true,
            serviceRunning = true,
            managedEnforced = false,
            emergencyActive = false,
            managedExtraSuspendedCount = 0,
            managedUnknownCount = 1,
        )
        assertEquals(ProtectionLevel.DEGRADED, result.level)
        assertEquals(false, result.personalModeReady)
        assertTrue(result.needsManagedRestore)
        assertEquals(1, result.managedUnknownCount)
        assertTrue(result.issues.any { it.contains("unverified") })
    }

    @Test
    fun `personal mode becomes ready only after lingering suspensions are verified cleared`() {
        val degraded = ProtectionEvaluator.evaluate(
            monitorEnabled = true,
            restrictedAppCount = 2,
            usageAccess = true,
            overlayAccess = true,
            serviceRunning = true,
            managedEnforced = false,
            emergencyActive = false,
            managedExtraSuspendedCount = 1,
            managedUnknownCount = 0,
        )
        assertEquals(ProtectionLevel.DEGRADED, degraded.level)
        assertEquals(false, degraded.personalModeReady)

        val cleared = ProtectionEvaluator.evaluate(
            monitorEnabled = true,
            restrictedAppCount = 2,
            usageAccess = true,
            overlayAccess = true,
            serviceRunning = true,
            managedEnforced = false,
            emergencyActive = false,
            managedExtraSuspendedCount = 0,
            managedUnknownCount = 0,
        )
        assertEquals(ProtectionLevel.PROTECTED, cleared.level)
        assertTrue(cleared.personalModeReady)
        assertEquals(false, cleared.needsManagedRestore)
    }

    @Test
    fun `managed mode cannot be Protected when audit has any mismatch`() {
        val missingAndExtra = ProtectionEvaluator.evaluate(
            monitorEnabled = true,
            restrictedAppCount = 2,
            usageAccess = false,
            overlayAccess = false,
            serviceRunning = false,
            managedEnforced = true,
            emergencyActive = false,
            managedUnsuspendedCount = 1,
            managedExtraSuspendedCount = 1,
            managedUnknownCount = 0,
        )
        assertEquals(ProtectionLevel.DEGRADED, missingAndExtra.level)
        assertEquals(false, missingAndExtra.managedModeReady)
        assertEquals(1, missingAndExtra.managedMissingCount)
        assertEquals(1, missingAndExtra.managedExtraSuspendedCount)
    }

    @Test
    fun `personal mode with lost Device Owner and unverified tracked apps sets needsManagedRestore`() {
        val result = ProtectionEvaluator.evaluate(
            monitorEnabled = true,
            restrictedAppCount = 2,
            usageAccess = true,
            overlayAccess = true,
            serviceRunning = true,
            managedEnforced = false,
            emergencyActive = false,
            managedUnknownCount = 1,
            managedDeviceOwnerLost = true,
        )
        assertEquals(ProtectionLevel.DEGRADED, result.level)
        assertEquals(false, result.personalModeReady)
        assertTrue(result.needsManagedRestore)
        assertEquals(1, result.managedUnknownCount)
    }
}
