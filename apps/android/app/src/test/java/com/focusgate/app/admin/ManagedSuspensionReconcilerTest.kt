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
        var partialOsChangeBeforeSuspendException: Boolean = false,
        var partialOsChangeBeforeUnsuspendException: Boolean = false,
        var markUnknownAfterSuspendException: Boolean = false,
        var markUnknownAfterUnsuspendException: Boolean = false,
        var revokeDeviceOwnerOnOperation: Boolean = false,
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
            if (revokeDeviceOwnerOnOperation) {
                deviceOwner = false
                throw SecurityException("Device Owner revoked during operation")
            }
            if (suspended && throwSecurityExceptionOnSuspend) {
                if (partialOsChangeBeforeSuspendException) {
                    osSuspended.addAll(packages - failSuspend)
                }
                if (markUnknownAfterSuspendException) {
                    unknownStatePackages.addAll(packages)
                }
                throw SecurityException("Device policy rejected suspend")
            }
            if (!suspended && throwSecurityExceptionOnUnsuspend) {
                if (partialOsChangeBeforeUnsuspendException) {
                    osSuspended.removeAll(packages - failUnsuspend)
                }
                if (markUnknownAfterUnsuspendException) {
                    unknownStatePackages.addAll(packages)
                }
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

    private fun evaluatePersonalTransition(
        audit: ManagedPolicyAudit,
        requiredCount: Int = 1,
        usageAccess: Boolean = true,
        overlayAccess: Boolean = true,
        serviceRunning: Boolean = true,
    ) = ProtectionEvaluator.evaluate(
        monitorEnabled = true,
        restrictedAppCount = requiredCount,
        usageAccess = usageAccess,
        overlayAccess = overlayAccess,
        serviceRunning = serviceRunning,
        managedEnforced = false,
        emergencyActive = false,
        managedUnsuspendedCount = 0,
        managedExtraSuspendedCount = audit.verifiedSuspended.size,
        managedUnknownCount = audit.unknownPackages.size,
        managedDeviceOwnerLost = !audit.deviceOwnerValid && audit.trackedPackages.isNotEmpty(),
    )

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

    // -------------------------------------------------------------------------
    // Group A: UNKNOWN state and recovery tracking
    // -------------------------------------------------------------------------

    @Test
    fun `A1 - new package throwing SecurityException with UNKNOWN query is retained in tracking`() {
        val backend = FakeBackend(
            initialTracked = emptySet(),
            initialOsSuspended = emptySet(),
            throwSecurityExceptionOnSuspend = true,
            markUnknownAfterSuspendException = true,
        )
        val result = ManagedSuspensionReconciler.applyBlockedPackages(
            blockedPackages = setOf(youtube),
            exemptPackages = emptySet(),
            ownPackage = ownPkg,
            deviceEssential = emptySet(),
            backend = backend,
        )
        assertFalse(result.applied)
        assertEquals(0, result.suspendedPackages)
        assertEquals(listOf(youtube), result.unknownPackages)
        assertEquals(listOf(youtube), result.failedToSuspend)
        assertTrue(result.exceptionMessage != null)
        assertEquals(setOf(youtube), backend.tracked)
        assertTrue(backend.osSuspended.isEmpty())

        val audit = ManagedSuspensionReconciler.auditPolicy(setOf(youtube), backend)
        assertEquals(setOf(youtube), audit.unknownPackages)
        assertEquals(setOf(youtube), audit.trackedPackages)
        assertFalse(audit.isExactMatch)

        val status = evaluateAudit(audit, requiredCount = 1)
        assertEquals(ProtectionLevel.DEGRADED, status.level)
        assertEquals(1, status.managedUnknownCount)
        assertFalse(status.managedModeReady)
    }

    @Test
    fun `A2 - UNKNOWN package removed from policy stays tracked and retries unsuspend`() {
        val backend = FakeBackend(
            initialTracked = emptySet(),
            initialOsSuspended = emptySet(),
            throwSecurityExceptionOnSuspend = true,
            markUnknownAfterSuspendException = true,
        )
        // Step 1: A added -> SecurityException + UNKNOWN
        val addResult = ManagedSuspensionReconciler.applyBlockedPackages(
            blockedPackages = setOf(youtube),
            exemptPackages = emptySet(),
            ownPackage = ownPkg,
            deviceEssential = emptySet(),
            backend = backend,
        )
        assertFalse(addResult.applied)
        assertEquals(setOf(youtube), backend.tracked)

        // Step 2: User removes youtube from policy while DPM still returns UNKNOWN & fails unsuspend.
        backend.throwSecurityExceptionOnSuspend = false
        backend.failUnsuspend = setOf(youtube)
        val removeResult = ManagedSuspensionReconciler.applyBlockedPackages(
            blockedPackages = emptySet(),
            exemptPackages = emptySet(),
            ownPackage = ownPkg,
            deviceEssential = emptySet(),
            backend = backend,
        )
        assertFalse(removeResult.applied)
        assertEquals(listOf(youtube), removeResult.unknownPackages)
        assertEquals(listOf(youtube), removeResult.failedToUnsuspend)
        assertEquals(setOf(youtube), backend.tracked)

        val audit = ManagedSuspensionReconciler.auditPolicy(emptySet(), backend)
        assertEquals(setOf(youtube), audit.unknownPackages)
        assertTrue(audit.hasLingeringSuspensions)
        val status = evaluateAudit(audit, requiredCount = 0)
        assertEquals(ProtectionLevel.DEGRADED, status.level)
        assertTrue(status.needsManagedRestore)
    }

    @Test
    fun `A3 - UNKNOWN package becoming NOT_SUSPENDED after DPM recovery is removed from tracking`() {
        val backend = FakeBackend(
            initialTracked = setOf(youtube),
            initialOsSuspended = emptySet(),
            unknownStatePackages = mutableSetOf(youtube),
        )
        // DPM recovers and reports youtube is NOT_SUSPENDED.
        backend.unknownStatePackages.clear()
        val result = ManagedSuspensionReconciler.applyBlockedPackages(
            blockedPackages = emptySet(),
            exemptPackages = emptySet(),
            ownPackage = ownPkg,
            deviceEssential = emptySet(),
            backend = backend,
        )
        assertTrue(result.applied)
        assertEquals(0, result.suspendedPackages)
        assertTrue(result.unknownPackages.isEmpty())
        assertTrue(backend.tracked.isEmpty())
        assertTrue(backend.osSuspended.isEmpty())

        val audit = ManagedSuspensionReconciler.auditPolicy(emptySet(), backend)
        assertTrue(audit.isExactMatch)
        assertFalse(audit.hasLingeringSuspensions)
        val status = evaluateAudit(audit, requiredCount = 0)
        assertEquals(ProtectionLevel.OFF, status.level)
    }

    @Test
    fun `A4 - UNKNOWN package becoming SUSPENDED after DPM recovery transitions to Protected`() {
        val backend = FakeBackend(
            initialTracked = setOf(youtube),
            initialOsSuspended = setOf(youtube),
            unknownStatePackages = mutableSetOf(youtube),
        )
        val degradedAudit = ManagedSuspensionReconciler.auditPolicy(setOf(youtube), backend)
        assertEquals(ProtectionLevel.DEGRADED, evaluateAudit(degradedAudit, 1).level)

        // DPM recovers and confirms youtube is SUSPENDED.
        backend.unknownStatePackages.clear()
        val result = ManagedSuspensionReconciler.applyBlockedPackages(
            blockedPackages = setOf(youtube),
            exemptPackages = emptySet(),
            ownPackage = ownPkg,
            deviceEssential = emptySet(),
            backend = backend,
        )
        assertTrue(result.applied)
        assertEquals(1, result.suspendedPackages)
        assertEquals(setOf(youtube), backend.tracked)
        assertEquals(setOf(youtube), backend.osSuspended)

        val audit = ManagedSuspensionReconciler.auditPolicy(setOf(youtube), backend)
        assertTrue(audit.isExactMatch)
        val status = evaluateAudit(audit, requiredCount = 1)
        assertEquals(ProtectionLevel.PROTECTED, status.level)
        assertTrue(status.managedModeReady)
    }

    @Test
    fun `A5 - UNKNOWN target package without prior tracking cannot report Protected`() {
        val backend = FakeBackend(
            initialTracked = emptySet(),
            initialOsSuspended = emptySet(),
            unknownStatePackages = mutableSetOf(youtube),
        )
        val audit = ManagedSuspensionReconciler.auditPolicy(setOf(youtube), backend)
        assertTrue(audit.verifiedSuspended.isEmpty())
        assertEquals(setOf(youtube), audit.unknownPackages)
        assertFalse(audit.isExactMatch)

        val status = evaluateAudit(audit, requiredCount = 1)
        assertEquals(ProtectionLevel.DEGRADED, status.level)
        assertEquals(1, status.managedUnknownCount)
        assertFalse(status.managedModeReady)
    }

    // -------------------------------------------------------------------------
    // Group B: Managed Mode -> Personal Mode transitions
    // -------------------------------------------------------------------------

    @Test
    fun `B6 - disabling Managed Mode with full restore allows Personal Mode Protected`() {
        val backend = FakeBackend(
            initialTracked = setOf(youtube, tiktok),
            initialOsSuspended = setOf(youtube, tiktok),
        )
        val clearResult = ManagedSuspensionReconciler.clearSuspensions(backend)
        assertTrue(clearResult.applied)
        assertTrue(backend.tracked.isEmpty())
        assertTrue(backend.osSuspended.isEmpty())

        val audit = ManagedSuspensionReconciler.auditPolicy(emptySet(), backend)
        assertTrue(audit.isExactMatch)
        assertFalse(audit.hasLingeringSuspensions)

        val status = evaluatePersonalTransition(audit, requiredCount = 2)
        assertEquals(ProtectionLevel.PROTECTED, status.level)
        assertTrue(status.personalModeReady)
        assertFalse(status.needsManagedRestore)
    }

    @Test
    fun `B7 - disabling Managed Mode when one app fails to unsuspend shows Degraded in Personal Mode`() {
        val backend = FakeBackend(
            initialTracked = setOf(youtube, tiktok),
            initialOsSuspended = setOf(youtube, tiktok),
            failUnsuspend = setOf(youtube),
        )
        val clearResult = ManagedSuspensionReconciler.clearSuspensions(backend)
        assertFalse(clearResult.applied)
        assertEquals(setOf(youtube), backend.tracked)
        assertEquals(setOf(youtube), backend.osSuspended)
        assertEquals(listOf(youtube), clearResult.failedToUnsuspend)

        val audit = ManagedSuspensionReconciler.auditPolicy(emptySet(), backend)
        assertEquals(setOf(youtube), audit.extraSuspended)
        assertTrue(audit.hasLingeringSuspensions)

        val status = evaluatePersonalTransition(audit, requiredCount = 2)
        assertEquals(ProtectionLevel.DEGRADED, status.level)
        assertFalse(status.personalModeReady)
        assertTrue(status.needsManagedRestore)
        assertEquals(1, status.managedExtraSuspendedCount)
    }

    @Test
    fun `B8 - disabling Managed Mode with UNKNOWN app shows Degraded in Personal Mode`() {
        val backend = FakeBackend(
            initialTracked = setOf(youtube),
            initialOsSuspended = setOf(youtube),
            throwSecurityExceptionOnUnsuspend = true,
            markUnknownAfterUnsuspendException = true,
        )
        val clearResult = ManagedSuspensionReconciler.clearSuspensions(backend)
        assertFalse(clearResult.applied)
        assertEquals(setOf(youtube), backend.tracked)
        assertEquals(listOf(youtube), clearResult.unknownPackages)

        val audit = ManagedSuspensionReconciler.auditPolicy(emptySet(), backend)
        assertEquals(setOf(youtube), audit.unknownPackages)
        assertTrue(audit.hasLingeringSuspensions)

        val status = evaluatePersonalTransition(audit, requiredCount = 1)
        assertEquals(ProtectionLevel.DEGRADED, status.level)
        assertFalse(status.personalModeReady)
        assertTrue(status.needsManagedRestore)
        assertEquals(1, status.managedUnknownCount)
    }

    @Test
    fun `B9 - retrying restore after Personal Mode transition updates audit and status to Protected`() {
        val backend = FakeBackend(
            initialTracked = setOf(youtube),
            initialOsSuspended = setOf(youtube),
            failUnsuspend = setOf(youtube),
        )
        val failedClear = ManagedSuspensionReconciler.clearSuspensions(backend)
        assertFalse(failedClear.applied)
        val degradedAudit = ManagedSuspensionReconciler.auditPolicy(emptySet(), backend)
        assertEquals(ProtectionLevel.DEGRADED, evaluatePersonalTransition(degradedAudit).level)

        // User taps "Restore suspended apps" after transient DPM issue clears.
        backend.failUnsuspend = emptySet()
        val retryClear = ManagedSuspensionReconciler.clearSuspensions(backend)
        assertTrue(retryClear.applied)
        assertTrue(backend.tracked.isEmpty())
        assertTrue(backend.osSuspended.isEmpty())

        val recoveredAudit = ManagedSuspensionReconciler.auditPolicy(emptySet(), backend)
        assertTrue(recoveredAudit.isExactMatch)
        val recoveredStatus = evaluatePersonalTransition(recoveredAudit)
        assertEquals(ProtectionLevel.PROTECTED, recoveredStatus.level)
        assertTrue(recoveredStatus.personalModeReady)
        assertFalse(recoveredStatus.needsManagedRestore)
    }

    @Test
    fun `B10 - revoking Device Owner while lingering packages remain reports Degraded and cannot claim restored`() {
        val backend = FakeBackend(
            deviceOwner = true,
            initialTracked = setOf(youtube),
            initialOsSuspended = setOf(youtube),
            revokeDeviceOwnerOnOperation = true,
        )
        val clearResult = ManagedSuspensionReconciler.clearSuspensions(backend)
        assertFalse(clearResult.applied)
        assertFalse(backend.deviceOwner)
        assertEquals(setOf(youtube), backend.tracked)

        val audit = ManagedSuspensionReconciler.auditPolicy(emptySet(), backend)
        assertFalse(audit.deviceOwnerValid)
        assertEquals(setOf(youtube), audit.unknownPackages)

        val status = evaluatePersonalTransition(audit, requiredCount = 1)
        assertEquals(ProtectionLevel.DEGRADED, status.level)
        assertFalse(status.personalModeReady)
        assertEquals(1, status.managedUnknownCount)
        assertTrue(status.issues.any { it.contains("Device Owner") })
    }

    // -------------------------------------------------------------------------
    // Group C: Exceptions and final OS state consistency
    // -------------------------------------------------------------------------

    @Test
    fun `C11 - apply throws SecurityException after OS already suspended all targets returns applied true`() {
        val backend = FakeBackend(
            initialTracked = emptySet(),
            initialOsSuspended = emptySet(),
            throwSecurityExceptionOnSuspend = true,
            partialOsChangeBeforeSuspendException = true,
        )
        val result = ManagedSuspensionReconciler.applyBlockedPackages(
            blockedPackages = setOf(youtube, tiktok),
            exemptPackages = emptySet(),
            ownPackage = ownPkg,
            deviceEssential = emptySet(),
            backend = backend,
        )
        // OS state query confirms all targets are actually suspended.
        assertTrue(result.applied)
        assertEquals(2, result.suspendedPackages)
        assertTrue(result.failures.isEmpty())
        assertTrue(result.exceptionMessage != null)
        assertEquals(setOf(youtube, tiktok), backend.tracked)
        assertEquals(setOf(youtube, tiktok), backend.osSuspended)

        val audit = ManagedSuspensionReconciler.auditPolicy(setOf(youtube, tiktok), backend)
        assertTrue(audit.isExactMatch)
        assertEquals(ProtectionLevel.PROTECTED, evaluateAudit(audit, 2).level)
    }

    @Test
    fun `C12 - clear throws SecurityException after OS already unsuspended all apps returns applied true`() {
        val backend = FakeBackend(
            initialTracked = setOf(youtube, tiktok),
            initialOsSuspended = setOf(youtube, tiktok),
            throwSecurityExceptionOnUnsuspend = true,
            partialOsChangeBeforeUnsuspendException = true,
        )
        val result = ManagedSuspensionReconciler.clearSuspensions(backend)
        assertTrue(result.applied)
        assertEquals(0, result.suspendedPackages)
        assertTrue(result.failures.isEmpty())
        assertTrue(result.exceptionMessage != null)
        assertTrue(backend.tracked.isEmpty())
        assertTrue(backend.osSuspended.isEmpty())

        val audit = ManagedSuspensionReconciler.auditPolicy(emptySet(), backend)
        assertTrue(audit.isExactMatch)
        assertEquals(ProtectionLevel.PROTECTED, evaluatePersonalTransition(audit, 2).level)
    }

    @Test
    fun `C13 - apply throws SecurityException and OS state remains UNKNOWN returns applied false and retains tracking`() {
        val backend = FakeBackend(
            initialTracked = emptySet(),
            initialOsSuspended = emptySet(),
            throwSecurityExceptionOnSuspend = true,
            markUnknownAfterSuspendException = true,
        )
        val result = ManagedSuspensionReconciler.applyBlockedPackages(
            blockedPackages = setOf(youtube),
            exemptPackages = emptySet(),
            ownPackage = ownPkg,
            deviceEssential = emptySet(),
            backend = backend,
        )
        assertFalse(result.applied)
        assertEquals(listOf(youtube), result.unknownPackages)
        assertEquals(setOf(youtube), backend.tracked)
        assertTrue(result.exceptionMessage != null)

        val audit = ManagedSuspensionReconciler.auditPolicy(setOf(youtube), backend)
        assertEquals(ProtectionLevel.DEGRADED, evaluateAudit(audit, 1).level)
    }

    @Test
    fun `C14 - step 1 unsuspend succeeds then step 2 partial SecurityException preserves step 1 and tracks UNKNOWN`() {
        val backend = FakeBackend(
            initialTracked = setOf(youtube),
            initialOsSuspended = setOf(youtube),
            throwSecurityExceptionOnSuspend = true,
            markUnknownAfterSuspendException = true,
        )
        val result = ManagedSuspensionReconciler.applyBlockedPackages(
            blockedPackages = setOf(tiktok),
            exemptPackages = emptySet(),
            ownPackage = ownPkg,
            deviceEssential = emptySet(),
            backend = backend,
        )
        assertFalse(result.applied)
        // Step 1 (unsuspend youtube) succeeded and must NOT be reverted to stale snapshot.
        assertFalse(youtube in backend.osSuspended)
        assertFalse(youtube in backend.tracked)
        // Step 2 (suspend tiktok) threw SecurityException + UNKNOWN -> tiktok MUST remain tracked.
        assertTrue(tiktok in backend.tracked)
        assertEquals(listOf(tiktok), result.unknownPackages)

        val audit = ManagedSuspensionReconciler.auditPolicy(setOf(tiktok), backend)
        assertEquals(setOf(tiktok), audit.unknownPackages)
        assertTrue(audit.extraSuspended.isEmpty())
        val status = evaluateAudit(audit, requiredCount = 1)
        assertEquals(ProtectionLevel.DEGRADED, status.level)
        assertEquals(1, status.managedUnknownCount)
    }
}
