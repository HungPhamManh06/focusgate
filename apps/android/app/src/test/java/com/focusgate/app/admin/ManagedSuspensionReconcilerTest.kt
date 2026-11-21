package com.focusgate.app.admin

import com.focusgate.app.policy.ProtectionEvaluator
import com.focusgate.app.policy.ProtectionLevel
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ManagedSuspensionReconcilerTest {

    private val ownPkg = "com.focusgate.app.managed"
    private val youtube = "com.google.android.youtube"
    private val tiktok = "com.zhiliaoapp.musically"
    private val instagram = "com.instagram.android"

    private class FakeBackend(
        var deviceOwner: Boolean = true,
        initialTracked: Set<String> = emptySet(),
        initialOsSuspended: Set<String> = initialTracked,
        var failSuspend: Set<String> = emptySet(),
        var failUnsuspend: Set<String> = emptySet(),
        var throwSecurityExceptionOnSuspend: Boolean = false,
        var throwSecurityExceptionOnUnsuspend: Boolean = false,
        var unknownStatePackages: MutableSet<String> = mutableSetOf(),
    ) : ManagedSuspensionBackend {
        var tracked: Set<String> = initialTracked.toSet()
        val osSuspended: MutableSet<String> = initialOsSuspended.toMutableSet()

        override fun isDeviceOwner(): Boolean = deviceOwner
        override fun loadTrackedSuspended(): Set<String> = tracked
        override fun saveTrackedSuspended(packages: Set<String>) {
            tracked = packages.toSet()
        }

        override fun setPackagesSuspended(packages: Set<String>, suspended: Boolean): Set<String> {
            if (suspended && throwSecurityExceptionOnSuspend) {
                throw SecurityException("Device policy rejected suspend")
            }
            if (!suspended && throwSecurityExceptionOnUnsuspend) {
                throw SecurityException("Device policy rejected unsuspend")
            }
            val failing = if (suspended) packages.intersect(failSuspend) else packages.intersect(failUnsuspend)
            val succeeded = packages - failing
            if (suspended) osSuspended.addAll(succeeded) else osSuspended.removeAll(succeeded)
            return failing
        }

        override fun querySuspensionState(packageName: String): PackageSuspensionState = when {
            packageName in unknownStatePackages -> PackageSuspensionState.UNKNOWN
            packageName in osSuspended -> PackageSuspensionState.SUSPENDED
            else -> PackageSuspensionState.NOT_SUSPENDED
        }
    }

    private fun evaluateAudit(
        audit: ManagedPolicyAudit,
        requiredCount: Int,
        monitorEnabled: Boolean = true,
        emergencyActive: Boolean = false,
    ) = ProtectionEvaluator.evaluate(
        monitorEnabled = monitorEnabled,
        restrictedAppCount = requiredCount,
        usageAccess = false,
        overlayAccess = false,
        serviceRunning = false,
        managedEnforced = audit.deviceOwnerValid && monitorEnabled && !emergencyActive,
        emergencyActive = emergencyActive,
        managedUnsuspendedCount = if (audit.deviceOwnerValid && monitorEnabled && !emergencyActive) {
            audit.requiredNotSuspended.size
        } else {
            0
        },
        managedExtraSuspendedCount = if (!monitorEnabled || emergencyActive) {
            audit.verifiedSuspended.size
        } else {
            audit.extraSuspended.size
        },
        managedUnknownCount = audit.unknownPackages.size,
        managedDeviceOwnerLost = !audit.deviceOwnerValid,
    )

    @Test
    fun `1 - tracked package with UNKNOWN OS state is retained for recovery but never Protected`() {
        val backend = FakeBackend(
            initialTracked = setOf(youtube),
            initialOsSuspended = setOf(youtube),
            unknownStatePackages = mutableSetOf(youtube),
        )
        val audit = ManagedSuspensionReconciler.auditPolicy(setOf(youtube), backend)
        assertTrue(audit.verifiedSuspended.isEmpty())
        assertEquals(setOf(youtube), audit.unknownPackages)
        assertEquals(setOf(youtube), audit.trackedPackages)
        assertFalse(audit.isExactMatch)

        val status = evaluateAudit(audit, requiredCount = 1)
        assertEquals(ProtectionLevel.DEGRADED, status.level)
        assertEquals(1, status.managedUnknownCount)
        assertFalse(status.managedModeReady)
    }

    @Test
    fun `2 - target package with UNKNOWN OS state is never reported Protected`() {
        val backend = FakeBackend(
            initialTracked = emptySet(),
            initialOsSuspended = emptySet(),
            unknownStatePackages = mutableSetOf(tiktok),
        )
        val result = ManagedSuspensionReconciler.applyBlockedPackages(
            blockedPackages = setOf(youtube, tiktok),
            exemptPackages = emptySet(),
            ownPackage = ownPkg,
            deviceEssential = emptySet(),
            backend = backend,
        )
        assertFalse(result.applied)
        assertEquals(1, result.suspendedPackages)
        assertEquals(listOf(tiktok), result.unknownPackages)
        assertEquals(setOf(youtube, tiktok), backend.tracked)

        val audit = ManagedSuspensionReconciler.auditPolicy(setOf(youtube, tiktok), backend)
        val status = evaluateAudit(audit, requiredCount = 2)
        assertEquals(ProtectionLevel.DEGRADED, status.level)
        assertEquals(1, status.managedUnknownCount)
    }

    @Test
    fun `3 - one required app not suspended reports Degraded with exact missing count`() {
        val backend = FakeBackend(
            initialTracked = setOf(youtube),
            initialOsSuspended = setOf(youtube),
            failSuspend = setOf(tiktok),
        )
        val result = ManagedSuspensionReconciler.applyBlockedPackages(
            blockedPackages = setOf(youtube, tiktok),
            exemptPackages = emptySet(),
            ownPackage = ownPkg,
            deviceEssential = emptySet(),
            backend = backend,
        )
        assertFalse(result.applied)
        assertEquals(setOf(youtube), backend.tracked)
        assertEquals(listOf(tiktok), result.failedToSuspend)

        val audit = ManagedSuspensionReconciler.auditPolicy(setOf(youtube, tiktok), backend)
        assertEquals(setOf(tiktok), audit.requiredNotSuspended)
        val status = evaluateAudit(audit, requiredCount = 2)
        assertEquals(ProtectionLevel.DEGRADED, status.level)
        assertEquals(1, status.managedMissingCount)
    }

    @Test
    fun `4 - extra suspended app outside policy reports Degraded with extra count`() {
        val backend = FakeBackend(
            initialTracked = setOf(youtube, tiktok),
            initialOsSuspended = setOf(youtube, tiktok),
        )
        // Saved policy only requires youtube, but tiktok is still suspended.
        val audit = ManagedSuspensionReconciler.auditPolicy(setOf(youtube), backend)
        assertTrue(audit.requiredNotSuspended.isEmpty())
        assertEquals(setOf(tiktok), audit.extraSuspended)
        assertFalse(audit.isExactMatch)

        val status = evaluateAudit(audit, requiredCount = 1)
        assertEquals(ProtectionLevel.DEGRADED, status.level)
        assertEquals(1, status.managedExtraSuspendedCount)
    }

    @Test
    fun `5 - empty required set with lingering suspended app warns Degraded instead of Off`() {
        val backend = FakeBackend(
            initialTracked = setOf(youtube),
            initialOsSuspended = setOf(youtube),
        )
        val audit = ManagedSuspensionReconciler.auditPolicy(emptySet(), backend)
        assertEquals(setOf(youtube), audit.extraSuspended)
        assertTrue(audit.hasLingeringSuspensions)

        val status = evaluateAudit(audit, requiredCount = 0)
        assertEquals(ProtectionLevel.DEGRADED, status.level)
        assertTrue(status.needsManagedRestore)
        assertEquals(1, status.managedExtraSuspendedCount)
    }

    @Test
    fun `6 - changing policy when unsuspend fails keeps app tracked and shows Degraded`() {
        val backend = FakeBackend(
            initialTracked = setOf(youtube, tiktok),
            initialOsSuspended = setOf(youtube, tiktok),
            failUnsuspend = setOf(youtube),
        )
        val result = ManagedSuspensionReconciler.applyBlockedPackages(
            blockedPackages = setOf(tiktok),
            exemptPackages = emptySet(),
            ownPackage = ownPkg,
            deviceEssential = emptySet(),
            backend = backend,
        )
        assertFalse(result.applied)
        assertEquals(listOf(youtube), result.failedToUnsuspend)
        assertTrue(result.failedToSuspend.isEmpty())
        assertEquals(setOf(youtube, tiktok), backend.tracked)

        val audit = ManagedSuspensionReconciler.auditPolicy(setOf(tiktok), backend)
        val status = evaluateAudit(audit, requiredCount = 1)
        assertEquals(ProtectionLevel.DEGRADED, status.level)
        assertEquals(1, status.managedExtraSuspendedCount)
    }

    @Test
    fun `7 - unsuspend succeeds then second call suspend throws SecurityException preserves partial progress`() {
        val backend = FakeBackend(
            initialTracked = setOf(youtube),
            initialOsSuspended = setOf(youtube),
            throwSecurityExceptionOnSuspend = true,
        )
        val result = ManagedSuspensionReconciler.applyBlockedPackages(
            blockedPackages = setOf(tiktok),
            exemptPackages = emptySet(),
            ownPackage = ownPkg,
            deviceEssential = emptySet(),
            backend = backend,
        )
        assertFalse(result.applied)
        // Unsuspend of youtube succeeded in call 1; it must NOT be restored as
        // tracked from the stale pre-operation snapshot.
        assertFalse(youtube in backend.osSuspended)
        assertTrue(backend.tracked.isEmpty())
        assertEquals(0, result.suspendedPackages)
        assertEquals(listOf(tiktok), result.failedToSuspend)
        assertTrue(result.failedToUnsuspend.isEmpty())

        val audit = ManagedSuspensionReconciler.auditPolicy(setOf(tiktok), backend)
        val status = evaluateAudit(audit, requiredCount = 1)
        assertEquals(ProtectionLevel.DEGRADED, status.level)
        assertEquals(1, status.managedMissingCount)
        assertEquals(0, status.managedExtraSuspendedCount)
    }

    @Test
    fun `8 - unknown package recovers to Protected when DPM works again`() {
        val backend = FakeBackend(
            initialTracked = setOf(youtube),
            initialOsSuspended = setOf(youtube),
            unknownStatePackages = mutableSetOf(youtube),
        )
        val degradedAudit = ManagedSuspensionReconciler.auditPolicy(setOf(youtube), backend)
        assertEquals(ProtectionLevel.DEGRADED, evaluateAudit(degradedAudit, 1).level)

        // DPM recovers and answers querySuspensionState normally.
        backend.unknownStatePackages.clear()
        val applyResult = ManagedSuspensionReconciler.applyBlockedPackages(
            blockedPackages = setOf(youtube),
            exemptPackages = emptySet(),
            ownPackage = ownPkg,
            deviceEssential = emptySet(),
            backend = backend,
        )
        assertTrue(applyResult.applied)
        assertTrue(applyResult.unknownPackages.isEmpty())

        val recoveredAudit = ManagedSuspensionReconciler.auditPolicy(setOf(youtube), backend)
        assertTrue(recoveredAudit.isExactMatch)
        val status = evaluateAudit(recoveredAudit, 1)
        assertEquals(ProtectionLevel.PROTECTED, status.level)
        assertTrue(status.managedModeReady)
    }

    @Test
    fun `9 - lost Device Owner reports Degraded and cannot claim Protected`() {
        val backend = FakeBackend(
            deviceOwner = false,
            initialTracked = setOf(youtube),
            initialOsSuspended = setOf(youtube),
        )
        val applyResult = ManagedSuspensionReconciler.applyBlockedPackages(
            blockedPackages = setOf(youtube),
            exemptPackages = emptySet(),
            ownPackage = ownPkg,
            deviceEssential = emptySet(),
            backend = backend,
        )
        assertFalse(applyResult.applied)

        val audit = ManagedSuspensionReconciler.auditPolicy(setOf(youtube), backend)
        assertFalse(audit.deviceOwnerValid)
        val status = evaluateAudit(audit, requiredCount = 1)
        assertEquals(ProtectionLevel.DEGRADED, status.level)
        assertTrue(status.issues.any { it.contains("Device Owner") })
    }

    @Test
    fun `10 - reconcile succeeds after external OS state change`() {
        val backend = FakeBackend(
            initialTracked = setOf(youtube, tiktok),
            initialOsSuspended = setOf(tiktok), // youtube was externally unsuspended
        )
        val beforeAudit = ManagedSuspensionReconciler.auditPolicy(setOf(youtube, tiktok), backend)
        assertEquals(setOf(youtube), beforeAudit.requiredNotSuspended)
        assertEquals(ProtectionLevel.DEGRADED, evaluateAudit(beforeAudit, 2).level)

        val result = ManagedSuspensionReconciler.applyBlockedPackages(
            blockedPackages = setOf(youtube, tiktok),
            exemptPackages = emptySet(),
            ownPackage = ownPkg,
            deviceEssential = emptySet(),
            backend = backend,
        )
        assertTrue(result.applied)
        assertEquals(setOf(youtube, tiktok), backend.tracked)
        assertEquals(setOf(youtube, tiktok), backend.osSuspended)

        val afterAudit = ManagedSuspensionReconciler.auditPolicy(setOf(youtube, tiktok), backend)
        assertTrue(afterAudit.isExactMatch)
        assertEquals(ProtectionLevel.PROTECTED, evaluateAudit(afterAudit, 2).level)
    }

    @Test
    fun `clearSuspensions retains failed unsuspend and recovers cleanly on retry`() {
        val backend = FakeBackend(
            initialTracked = setOf(youtube, tiktok),
            initialOsSuspended = setOf(youtube, tiktok),
            failUnsuspend = setOf(youtube),
        )
        val first = ManagedSuspensionReconciler.clearSuspensions(backend)
        assertFalse(first.applied)
        assertEquals(setOf(youtube), backend.tracked)
        assertEquals(listOf(youtube), first.failedToUnsuspend)

        backend.failUnsuspend = emptySet()
        val retry = ManagedSuspensionReconciler.clearSuspensions(backend)
        assertTrue(retry.applied)
        assertTrue(backend.tracked.isEmpty())
        assertEquals(0, retry.suspendedPackages)
    }

    @Test
    fun `never suspends own package, exempt apps, or essential apps`() {
        val backend = FakeBackend()
        val result = ManagedSuspensionReconciler.applyBlockedPackages(
            blockedPackages = setOf(ownPkg, youtube, tiktok, "com.android.settings", "com.oem.launcher"),
            exemptPackages = setOf(tiktok),
            ownPackage = ownPkg,
            deviceEssential = setOf("com.oem.launcher"),
            backend = backend,
        )
        assertTrue(result.applied)
        assertEquals(setOf(youtube), backend.tracked)
        assertEquals(setOf(instagram).intersect(backend.tracked), emptySet<String>())
    }
}
