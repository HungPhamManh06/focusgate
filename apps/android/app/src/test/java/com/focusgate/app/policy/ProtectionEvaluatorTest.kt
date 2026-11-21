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
}
