package com.focusgate.app.admin

import com.focusgate.app.policy.ProtectionEvaluator
import com.focusgate.app.policy.ProtectionLevel
import com.focusgate.app.policy.ProtectionSnapshot
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.concurrent.atomic.AtomicInteger

class PolicyOperationCoordinatorTest {

    private val ownPkg = "com.focusgate.app.managed"
    private val youtube = "com.google.android.youtube"
    private val tiktok = "com.zhiliaoapp.musically"
    private val instagram = "com.instagram.android"

    private inner class FakeCoordinatorStore(
        var monitorState: Boolean = true,
        var managedState: Boolean = true,
        var deviceOwner: Boolean = true,
        var emergencyActive: Boolean = false,
        var savedBlocked: Set<String> = emptySet(),
        var savedExempt: Set<String> = emptySet(),
        var managedFlavor: Boolean = true,
        var personalPermissions: Boolean = true,
        var failSuspend: Set<String> = emptySet(),
        var failUnsuspend: Set<String> = emptySet(),
        var ignoreOsUnsuspend: Set<String> = emptySet(),
        var throwSecurityExceptionOnClear: Boolean = false,
        var revokeDeviceOwnerOnDpmCall: Boolean = false,
        var throwUnexpectedOnEmergencyStart: Boolean = false,
    ) : PolicyCoordinatorStore {
        val trackedSuspended = mutableSetOf<String>()
        val osSuspended = mutableSetOf<String>()
        val concurrentDpmCalls = AtomicInteger(0)
        var maxConcurrentDpmCalls = 0
        var dpmSetCalls = 0
        val callLog = mutableListOf<String>()
        var personalMonitorRunning = false

        val unknownStatePackages = mutableSetOf<String>()

        var onSaveRulesStarted: CompletableDeferred<Unit>? = null
        var allowSaveRulesToFinish: CompletableDeferred<Unit>? = null

        override suspend fun readRuntimeState(): PolicyRuntimeState = PolicyRuntimeState(
            monitorEnabled = monitorState,
            managedEnabled = managedState,
            deviceOwner = deviceOwner,
            emergencyActive = emergencyActive,
            savedBlocked = savedBlocked,
            savedExempt = savedExempt,
            ownPackage = ownPkg,
            deviceEssential = emptySet(),
        )

        override suspend fun saveRules(blocked: Set<String>, exempt: Set<String>): Boolean {
            onSaveRulesStarted?.complete(Unit)
            allowSaveRulesToFinish?.await()
            savedBlocked = blocked.toSet()
            savedExempt = exempt.toSet()
            callLog.add("saveRules:${blocked.sorted()}")
            return true
        }

        override fun setMonitorEnabled(enabled: Boolean) {
            monitorState = enabled
            callLog.add("setMonitor:$enabled")
        }

        override fun setManagedEnabled(enabled: Boolean) {
            managedState = enabled
            callLog.add("setManaged:$enabled")
        }

        override fun startEmergency(minutes: Int) {
            if (throwUnexpectedOnEmergencyStart) {
                throw IllegalStateException("Emergency store failure")
            }
            emergencyActive = true
            callLog.add("startEmergency")
        }

        override fun endEmergency() {
            emergencyActive = false
            callLog.add("endEmergency")
        }

        override fun clearEmergencyIfRebooted() {
            emergencyActive = false
            callLog.add("clearEmergencyIfRebooted")
        }

        override fun startPersonalMonitor(): Boolean {
            personalMonitorRunning = true
            callLog.add("startPersonalMonitor")
            return true
        }

        override fun stopPersonalMonitor() {
            personalMonitorRunning = false
            callLog.add("stopPersonalMonitor")
        }

        private val backend = object : ManagedSuspensionBackend {
            override fun isDeviceOwner(): Boolean = deviceOwner
            override fun loadTrackedSuspended(): Set<String> = trackedSuspended.toSet()
            override fun saveTrackedSuspended(packages: Set<String>) {
                trackedSuspended.clear()
                trackedSuspended.addAll(packages)
            }

            override fun setPackagesSuspended(packages: Set<String>, suspended: Boolean): Set<String> {
                dpmSetCalls++
                val active = concurrentDpmCalls.incrementAndGet()
                maxConcurrentDpmCalls = maxOf(maxConcurrentDpmCalls, active)
                try {
                    if (revokeDeviceOwnerOnDpmCall) {
                        deviceOwner = false
                        throw SecurityException("Device Owner revoked")
                    }
                    if (!suspended && throwSecurityExceptionOnClear) {
                        throw SecurityException("DPM rejected unsuspend")
                    }
                    val failing = if (suspended) packages.intersect(failSuspend) else packages.intersect(failUnsuspend)
                    val succeeded = packages - failing
                    if (suspended) {
                        osSuspended.addAll(succeeded)
                    } else {
                        osSuspended.removeAll(succeeded - ignoreOsUnsuspend)
                    }
                    return failing
                } finally {
                    concurrentDpmCalls.decrementAndGet()
                }
            }

            override fun querySuspensionState(packageName: String): PackageSuspensionState = when {
                packageName in unknownStatePackages -> PackageSuspensionState.UNKNOWN
                packageName in osSuspended -> PackageSuspensionState.SUSPENDED
                else -> PackageSuspensionState.NOT_SUSPENDED
            }
        }

        override fun auditManaged(requiredPackages: Set<String>): ManagedPolicyAudit =
            ManagedSuspensionReconciler.auditPolicy(requiredPackages, backend)

        override fun applyManaged(blocked: Set<String>, exempt: Set<String>): ManagedApplyResult {
            callLog.add("applyManaged:${blocked.sorted()}")
            return ManagedSuspensionReconciler.applyBlockedPackages(
                blockedPackages = blocked,
                exemptPackages = exempt,
                ownPackage = ownPkg,
                deviceEssential = emptySet(),
                backend = backend,
            )
        }

        override fun clearManaged(): ManagedApplyResult {
            callLog.add("clearManaged")
            return ManagedSuspensionReconciler.clearSuspensions(backend)
        }

        override fun isManagedFlavor(): Boolean = managedFlavor
        override fun hasPersonalPermissions(): Boolean = personalPermissions
        override fun notifyProtectionLost(message: String) {
            callLog.add("notify:$message")
        }
    }

    @Test
    fun `Scenario A - Save started then Disable Managed never leaves apps suspended`() = runBlocking {
        val store = FakeCoordinatorStore(
            managedState = true,
            savedBlocked = setOf(youtube),
        )
        val saveStarted = CompletableDeferred<Unit>()
        val releaseSave = CompletableDeferred<Unit>()
        store.onSaveRulesStarted = saveStarted
        store.allowSaveRulesToFinish = releaseSave

        val coordinator = PolicyOperationCoordinator(store)

        val saveJob = async { coordinator.savePolicy(setOf(youtube, tiktok), emptySet()) }
        saveStarted.await()

        // User disables Managed Mode while Save is in flight.
        val disableJob = async { coordinator.setManagedMode(false) }

        releaseSave.complete(Unit)
        saveJob.await()
        val disableOutcome = disableJob.await()

        assertFalse(store.managedState)
        assertTrue(store.osSuspended.isEmpty())
        assertTrue(store.trackedSuspended.isEmpty())
        assertTrue(disableOutcome.audit.isExactMatch)
        assertEquals(1, store.maxConcurrentDpmCalls)
    }

    @Test
    fun `Scenario B - Disable Managed then Save Policy never applies via Device Owner`() = runBlocking {
        val store = FakeCoordinatorStore(
            managedState = true,
            savedBlocked = setOf(youtube),
        )
        val coordinator = PolicyOperationCoordinator(store)

        val disableOutcome = coordinator.setManagedMode(false)
        assertFalse(disableOutcome.state.managedEnabled)
        assertTrue(store.osSuspended.isEmpty())

        val saveOutcome = coordinator.savePolicy(setOf(tiktok), emptySet())
        assertFalse(saveOutcome.state.managedEnabled)
        assertEquals(setOf(tiktok), saveOutcome.state.savedBlocked)
        assertTrue(store.osSuspended.isEmpty())
        assertTrue(store.trackedSuspended.isEmpty())
        assertTrue(saveOutcome.audit.isExactMatch)
    }

    @Test
    fun `Scenario C - Two rapid Save Policy calls serialize and latest policy wins`() = runBlocking {
        val store = FakeCoordinatorStore(managedState = true)
        val firstSaveStarted = CompletableDeferred<Unit>()
        val releaseFirstSave = CompletableDeferred<Unit>()
        store.onSaveRulesStarted = firstSaveStarted
        store.allowSaveRulesToFinish = releaseFirstSave

        val coordinator = PolicyOperationCoordinator(store)

        val firstSave = async { coordinator.savePolicy(setOf(youtube), emptySet()) }
        firstSaveStarted.await()

        // Second save arrives while first save is holding the coordinator mutex.
        val secondSave = async {
            store.onSaveRulesStarted = null
            store.allowSaveRulesToFinish = null
            coordinator.savePolicy(setOf(tiktok, instagram), emptySet())
        }

        releaseFirstSave.complete(Unit)
        firstSave.await()
        val finalOutcome = secondSave.await()

        assertEquals(setOf(tiktok, instagram), store.savedBlocked)
        assertEquals(setOf(tiktok, instagram), store.osSuspended)
        assertEquals(setOf(tiktok, instagram), finalOutcome.audit.verifiedSuspended)
        assertTrue(finalOutcome.audit.isExactMatch)
        assertEquals(1, store.maxConcurrentDpmCalls)
    }

    @Test
    fun `Scenario D - Emergency clears suspensions and End Emergency applies latest saved policy`() = runBlocking {
        val store = FakeCoordinatorStore(
            managedState = true,
            savedBlocked = setOf(youtube),
        )
        val coordinator = PolicyOperationCoordinator(store)

        coordinator.applyManagedPolicy()
        assertEquals(setOf(youtube), store.osSuspended)

        val emergencyOutcome = coordinator.startEmergency(10)
        assertTrue(emergencyOutcome.state.emergencyActive)
        assertTrue(store.osSuspended.isEmpty())

        // User updates saved policy during emergency.
        coordinator.savePolicy(setOf(tiktok), emptySet())
        assertTrue(store.osSuspended.isEmpty())

        val endOutcome = coordinator.endEmergency()
        assertFalse(endOutcome.state.emergencyActive)
        assertEquals(setOf(tiktok), store.osSuspended)
        assertTrue(endOutcome.audit.isExactMatch)
    }

    @Test
    fun `Scenario E - Boot Recovery clears lingering suspensions when Managed Mode is off`() = runBlocking {
        val store = FakeCoordinatorStore(
            monitorState = true,
            managedState = false,
            emergencyActive = true,
            savedBlocked = setOf(youtube),
        )
        // Simulate lingering suspension left over from before reboot.
        store.trackedSuspended.add(youtube)
        store.osSuspended.add(youtube)

        val coordinator = PolicyOperationCoordinator(store)
        val outcome = coordinator.bootRecover()

        assertFalse(outcome.state.emergencyActive)
        assertFalse(outcome.state.managedEnabled)
        assertTrue(store.osSuspended.isEmpty())
        assertTrue(store.trackedSuspended.isEmpty())
        assertTrue(store.personalMonitorRunning)
        assertTrue(outcome.audit.isExactMatch)
    }

    @Test
    fun `Boot Recovery applies Managed Policy when Managed Mode is on`() = runBlocking {
        val store = FakeCoordinatorStore(
            monitorState = true,
            managedState = true,
            emergencyActive = true,
            savedBlocked = setOf(youtube, tiktok),
        )
        val coordinator = PolicyOperationCoordinator(store)
        val outcome = coordinator.bootRecover()

        assertFalse(outcome.state.emergencyActive)
        assertEquals(setOf(youtube, tiktok), store.osSuspended)
        assertFalse(store.personalMonitorRunning)
        assertTrue(outcome.audit.isExactMatch)
    }

    private fun evaluateOutcome(
        outcome: PolicyOperationOutcome,
        usageAccess: Boolean = true,
        overlayAccess: Boolean = true,
        serviceRunning: Boolean = true,
    ): ProtectionSnapshot {
        val state = outcome.state
        val audit = outcome.audit
        val managedActive = state.managedEnabled && state.deviceOwner
        val managedDeviceOwnerLost = (state.managedEnabled || audit.trackedPackages.isNotEmpty()) &&
            !state.deviceOwner
        val managedUnsuspended = if (managedActive && state.monitorEnabled && !state.emergencyActive) {
            audit.requiredNotSuspended.size
        } else {
            0
        }
        val managedExtraSuspended = when {
            !state.monitorEnabled || state.emergencyActive -> audit.verifiedSuspended.size
            managedActive -> audit.extraSuspended.size
            else -> audit.verifiedSuspended.size
        }
        return ProtectionEvaluator.evaluate(
            monitorEnabled = state.monitorEnabled,
            restrictedAppCount = state.savedBlocked.size,
            usageAccess = usageAccess,
            overlayAccess = overlayAccess,
            serviceRunning = serviceRunning,
            managedEnforced = managedActive && !state.emergencyActive,
            emergencyActive = state.emergencyActive,
            managedUnsuspendedCount = managedUnsuspended,
            managedExtraSuspendedCount = managedExtraSuspended,
            managedUnknownCount = audit.unknownPackages.size,
            managedDeviceOwnerLost = managedDeviceOwnerLost,
        )
    }

    // -------------------------------------------------------------------------
    // Milestone 1.2.3 Group A: Device Owner Loss Recovery (A1 - A10)
    // -------------------------------------------------------------------------

    @Test
    fun `M123-A1 - enabling Managed Mode without Device Owner is rejected`() = runBlocking {
        val store = FakeCoordinatorStore(
            deviceOwner = false,
            managedState = false,
            savedBlocked = setOf(youtube),
        )
        val coordinator = PolicyOperationCoordinator(store)
        val outcome = coordinator.setManagedMode(true)

        assertFalse(store.managedState)
        assertFalse(outcome.state.managedEnabled)
        assertFalse(outcome.state.deviceOwner)
        assertEquals(0, store.dpmSetCalls)
        assertTrue(outcome.bannerMessage?.contains("Device Owner") == true)
    }

    @Test
    fun `M123-A2 - disabling Managed Mode without Device Owner succeeds and persists OFF`() = runBlocking {
        val store = FakeCoordinatorStore(
            deviceOwner = false,
            managedState = true,
            savedBlocked = setOf(youtube),
        )
        val coordinator = PolicyOperationCoordinator(store)
        val outcome = coordinator.setManagedMode(false)

        assertFalse(store.managedState)
        assertFalse(outcome.state.managedEnabled)
        assertFalse(outcome.state.deviceOwner)
        assertEquals(0, store.dpmSetCalls)
        assertNull(outcome.applyResult)
    }

    @Test
    fun `M123-A3 - disabling Managed Mode with lost Device Owner preserves tracked packages`() = runBlocking {
        val store = FakeCoordinatorStore(
            deviceOwner = false,
            managedState = true,
            savedBlocked = setOf(youtube, tiktok),
        )
        store.trackedSuspended.addAll(setOf(youtube, tiktok))
        store.osSuspended.addAll(setOf(youtube, tiktok))

        val coordinator = PolicyOperationCoordinator(store)
        val outcome = coordinator.setManagedMode(false)

        assertFalse(store.managedState)
        assertEquals(0, store.dpmSetCalls)
        assertEquals(setOf(youtube, tiktok), store.trackedSuspended)
        assertEquals(setOf(youtube, tiktok), outcome.audit.trackedPackages)
        assertEquals(setOf(youtube, tiktok), outcome.audit.unknownPackages)
        assertFalse(outcome.audit.deviceOwnerValid)
    }

    @Test
    fun `M123-A4 - disabling Managed Mode with lost Device Owner starts Personal Monitor when permissions granted`() = runBlocking {
        val store = FakeCoordinatorStore(
            deviceOwner = false,
            managedState = true,
            personalPermissions = true,
            savedBlocked = setOf(youtube),
        )
        val coordinator = PolicyOperationCoordinator(store)
        val outcome = coordinator.setManagedMode(false)

        assertFalse(outcome.state.managedEnabled)
        assertTrue(store.personalMonitorRunning)
        assertEquals(0, store.dpmSetCalls)
    }

    @Test
    fun `M123-A5 - disabling Managed Mode with lost Device Owner and UNKNOWN packages reports Degraded`() = runBlocking {
        val store = FakeCoordinatorStore(
            deviceOwner = false,
            managedState = true,
            personalPermissions = true,
            savedBlocked = setOf(youtube),
        )
        store.trackedSuspended.add(youtube)
        store.osSuspended.add(youtube)

        val coordinator = PolicyOperationCoordinator(store)
        val outcome = coordinator.setManagedMode(false)
        val status = evaluateOutcome(outcome, serviceRunning = store.personalMonitorRunning)

        assertFalse(outcome.state.managedEnabled)
        assertEquals(setOf(youtube), outcome.audit.unknownPackages)
        assertEquals(ProtectionLevel.DEGRADED, status.level)
        assertFalse(status.personalModeReady)
        assertEquals(1, status.managedUnknownCount)
    }

    @Test
    fun `M123-A6 - disabling Managed Mode with lost Device Owner and no tracked packages allows Personal Mode Protected`() = runBlocking {
        val store = FakeCoordinatorStore(
            deviceOwner = false,
            managedState = true,
            personalPermissions = true,
            savedBlocked = setOf(youtube),
        )
        val coordinator = PolicyOperationCoordinator(store)
        val outcome = coordinator.setManagedMode(false)
        val status = evaluateOutcome(outcome, serviceRunning = store.personalMonitorRunning)

        assertFalse(outcome.state.managedEnabled)
        assertTrue(store.trackedSuspended.isEmpty())
        assertTrue(outcome.audit.unknownPackages.isEmpty())
        assertTrue(store.personalMonitorRunning)
        assertEquals(ProtectionLevel.PROTECTED, status.level)
        assertTrue(status.personalModeReady)
    }

    @Test
    fun `M123-A7 and A8 - regaining Device Owner after switching to Personal Mode allows Restore and clears tracking`() = runBlocking {
        val store = FakeCoordinatorStore(
            deviceOwner = false,
            managedState = true,
            personalPermissions = true,
            savedBlocked = setOf(youtube),
        )
        store.trackedSuspended.add(youtube)
        store.osSuspended.add(youtube)

        val coordinator = PolicyOperationCoordinator(store)
        val switched = coordinator.setManagedMode(false)
        assertEquals(ProtectionLevel.DEGRADED, evaluateOutcome(switched).level)
        assertEquals(setOf(youtube), store.trackedSuspended)

        // Device Owner is restored later.
        store.deviceOwner = true
        val auditBeforeRestore = coordinator.auditCurrentPolicy()
        assertEquals(setOf(youtube), auditBeforeRestore.audit.extraSuspended)
        assertEquals(ProtectionLevel.DEGRADED, evaluateOutcome(auditBeforeRestore).level)

        val restored = coordinator.restoreSuspendedApps()
        assertTrue(restored.applyResult?.applied == true)
        assertTrue(store.dpmSetCalls >= 1)
        assertTrue(store.trackedSuspended.isEmpty())
        assertTrue(store.osSuspended.isEmpty())
        assertTrue(restored.audit.isExactMatch)

        val finalStatus = evaluateOutcome(restored, serviceRunning = store.personalMonitorRunning)
        assertEquals(ProtectionLevel.PROTECTED, finalStatus.level)
        assertTrue(finalStatus.personalModeReady)
    }

    @Test
    fun `M123-A9 - lost Device Owner never pretends apps were restored`() = runBlocking {
        val store = FakeCoordinatorStore(
            deviceOwner = false,
            managedState = false,
            savedBlocked = setOf(youtube),
        )
        store.trackedSuspended.add(youtube)
        store.osSuspended.add(youtube)

        val coordinator = PolicyOperationCoordinator(store)
        val restoreAttempt = coordinator.restoreSuspendedApps()

        assertNull(restoreAttempt.applyResult)
        assertEquals(0, store.dpmSetCalls)
        assertEquals(setOf(youtube), store.trackedSuspended)
        assertEquals(ProtectionLevel.DEGRADED, evaluateOutcome(restoreAttempt).level)
    }

    @Test
    fun `M123-A10 - losing Device Owner mid-operation never claims Protected from stale snapshot`() = runBlocking {
        val store = FakeCoordinatorStore(
            deviceOwner = true,
            managedState = true,
            savedBlocked = setOf(youtube),
            revokeDeviceOwnerOnDpmCall = true,
        )
        val coordinator = PolicyOperationCoordinator(store)
        val outcome = coordinator.applyManagedPolicy()

        assertFalse(outcome.state.deviceOwner)
        assertFalse(outcome.applyResult?.applied == true)
        assertEquals(setOf(youtube), store.trackedSuspended)
        assertFalse(outcome.audit.deviceOwnerValid)
        assertEquals(ProtectionLevel.DEGRADED, evaluateOutcome(outcome).level)
    }

    // -------------------------------------------------------------------------
    // Milestone 1.2.3 Group B: Emergency Access & Notification Presentation (B1 - B12)
    // -------------------------------------------------------------------------

    @Test
    fun `M123-B1 - Managed Mode valid Device Owner clear succeeds yields EMERGENCY_ACTIVE`() = runBlocking {
        val store = FakeCoordinatorStore(
            deviceOwner = true,
            managedState = true,
            savedBlocked = setOf(youtube, tiktok),
        )
        store.trackedSuspended.addAll(setOf(youtube, tiktok))
        store.osSuspended.addAll(setOf(youtube, tiktok))

        val coordinator = PolicyOperationCoordinator(store)
        val outcome = coordinator.startEmergency(10)
        val presentation = EmergencyStatusEvaluator.evaluate(outcome)

        assertTrue(outcome.state.emergencyActive)
        assertTrue(outcome.applyResult?.applied == true)
        assertTrue(store.osSuspended.isEmpty())
        assertTrue(store.trackedSuspended.isEmpty())
        assertEquals(EmergencyPresentationState.EMERGENCY_ACTIVE, presentation.state)
        assertFalse(presentation.needsRecoveryRetry)
        assertEquals(ProtectionLevel.DEGRADED, evaluateOutcome(outcome).level)
    }

    @Test
    fun `M123-B2 - Managed Mode DPM failure during Emergency shows EMERGENCY_ACTIVE_DEGRADED`() = runBlocking {
        val store = FakeCoordinatorStore(
            deviceOwner = true,
            managedState = true,
            savedBlocked = setOf(youtube, tiktok),
            failUnsuspend = setOf(youtube),
        )
        store.trackedSuspended.addAll(setOf(youtube, tiktok))
        store.osSuspended.addAll(setOf(youtube, tiktok))

        val coordinator = PolicyOperationCoordinator(store)
        val outcome = coordinator.startEmergency(10)
        val presentation = EmergencyStatusEvaluator.evaluate(outcome)

        assertTrue(outcome.state.emergencyActive)
        assertFalse(outcome.applyResult?.applied == true)
        assertEquals(setOf(youtube), store.osSuspended)
        assertEquals(setOf(youtube), store.trackedSuspended)
        assertEquals(EmergencyPresentationState.EMERGENCY_ACTIVE_DEGRADED, presentation.state)
        assertEquals(1, presentation.suspendedCount)
        assertTrue(presentation.needsRecoveryRetry)
    }

    @Test
    fun `M123-B3 - Managed Mode UNKNOWN package during Emergency never claims full unlock`() = runBlocking {
        val store = FakeCoordinatorStore(
            deviceOwner = true,
            managedState = true,
            savedBlocked = setOf(youtube),
            throwSecurityExceptionOnClear = true,
        )
        store.trackedSuspended.add(youtube)
        store.osSuspended.add(youtube)
        store.unknownStatePackages.add(youtube)

        val coordinator = PolicyOperationCoordinator(store)
        val outcome = coordinator.startEmergency(10)
        val presentation = EmergencyStatusEvaluator.evaluate(outcome)

        assertTrue(outcome.state.emergencyActive)
        assertFalse(outcome.applyResult?.applied == true)
        assertEquals(setOf(youtube), store.trackedSuspended)
        assertEquals(EmergencyPresentationState.EMERGENCY_ACTIVE_DEGRADED, presentation.state)
        assertEquals(1, presentation.unknownCount)
        assertTrue(presentation.needsRecoveryRetry)
    }

    @Test
    fun `M123-B4 - app still SUSPENDED despite DPM claiming unsuspend success shows EMERGENCY_ACTIVE_DEGRADED`() = runBlocking {
        val store = FakeCoordinatorStore(
            deviceOwner = true,
            managedState = true,
            savedBlocked = setOf(youtube),
            ignoreOsUnsuspend = setOf(youtube),
        )
        store.trackedSuspended.add(youtube)
        store.osSuspended.add(youtube)

        val coordinator = PolicyOperationCoordinator(store)
        val outcome = coordinator.startEmergency(10)
        val presentation = EmergencyStatusEvaluator.evaluate(outcome)

        assertTrue(outcome.state.emergencyActive)
        assertFalse(outcome.applyResult?.applied == true)
        assertEquals(setOf(youtube), outcome.audit.extraSuspended)
        assertEquals(EmergencyPresentationState.EMERGENCY_ACTIVE_DEGRADED, presentation.state)
        assertEquals(1, presentation.suspendedCount)
    }

    @Test
    fun `M123-B5 - retry recovery during active Emergency updates audit and presentation`() = runBlocking {
        val store = FakeCoordinatorStore(
            deviceOwner = true,
            managedState = true,
            savedBlocked = setOf(youtube),
            failUnsuspend = setOf(youtube),
        )
        store.trackedSuspended.add(youtube)
        store.osSuspended.add(youtube)

        val coordinator = PolicyOperationCoordinator(store)
        val initial = coordinator.startEmergency(10)
        assertEquals(EmergencyPresentationState.EMERGENCY_ACTIVE_DEGRADED, EmergencyStatusEvaluator.evaluate(initial).state)

        // DPM recovers and user retries restore while emergency is still active.
        store.failUnsuspend = emptySet()
        val retried = coordinator.restoreSuspendedApps()
        val presentation = EmergencyStatusEvaluator.evaluate(retried)

        assertTrue(retried.state.emergencyActive)
        assertTrue(retried.applyResult?.applied == true)
        assertTrue(store.trackedSuspended.isEmpty())
        assertTrue(store.osSuspended.isEmpty())
        assertEquals(EmergencyPresentationState.EMERGENCY_ACTIVE, presentation.state)
        assertFalse(presentation.needsRecoveryRetry)
    }

    @Test
    fun `M123-B6 and B7 - saving policy during Emergency does not suspend until End Emergency applies latest policy`() = runBlocking {
        val store = FakeCoordinatorStore(
            deviceOwner = true,
            managedState = true,
            savedBlocked = setOf(youtube),
        )
        val coordinator = PolicyOperationCoordinator(store)
        coordinator.applyManagedPolicy()
        assertEquals(setOf(youtube), store.osSuspended)

        coordinator.startEmergency(10)
        assertTrue(store.osSuspended.isEmpty())

        // Save new policy while emergency is active: must NOT suspend instagram yet.
        val saveDuringEmergency = coordinator.savePolicy(setOf(instagram), emptySet())
        assertTrue(saveDuringEmergency.state.emergencyActive)
        assertEquals(setOf(instagram), store.savedBlocked)
        assertTrue(store.osSuspended.isEmpty())

        // End emergency applies the latest policy (instagram), not the old one (youtube).
        val endOutcome = coordinator.endEmergency()
        assertFalse(endOutcome.state.emergencyActive)
        assertEquals(setOf(instagram), store.osSuspended)
        assertTrue(endOutcome.audit.isExactMatch)
        assertEquals(ProtectionLevel.PROTECTED, evaluateOutcome(endOutcome).level)
    }

    @Test
    fun `M123-B8 - Emergency Access in Personal Mode does not call Managed DPM`() = runBlocking {
        val store = FakeCoordinatorStore(
            managedFlavor = false,
            deviceOwner = false,
            managedState = false,
            savedBlocked = setOf(youtube),
        )
        val coordinator = PolicyOperationCoordinator(store)
        val outcome = coordinator.startEmergency(10)
        val presentation = EmergencyStatusEvaluator.evaluate(outcome)

        assertTrue(outcome.state.emergencyActive)
        assertEquals(0, store.dpmSetCalls)
        assertNull(outcome.applyResult)
        assertEquals(EmergencyPresentationState.EMERGENCY_ACTIVE, presentation.state)
    }

    @Test
    fun `M123-B9 - EmergencyExpiryReceiver reconciliation respects latest mode when Emergency ends`() = runBlocking {
        val store = FakeCoordinatorStore(
            deviceOwner = true,
            managedState = true,
            savedBlocked = setOf(youtube),
        )
        val coordinator = PolicyOperationCoordinator(store)
        coordinator.applyManagedPolicy()
        coordinator.startEmergency(10)

        // User switches to Personal Mode and changes saved policy before emergency expires.
        coordinator.setManagedMode(false)
        coordinator.savePolicy(setOf(tiktok), emptySet())

        // Expiry receiver calls coordinator.endEmergency().
        val expiredOutcome = coordinator.endEmergency()
        assertFalse(expiredOutcome.state.emergencyActive)
        assertFalse(expiredOutcome.state.managedEnabled)
        assertTrue(store.osSuspended.isEmpty())
        assertTrue(store.personalMonitorRunning)
        assertEquals(ProtectionLevel.PROTECTED, evaluateOutcome(expiredOutcome, serviceRunning = true).level)
    }

    @Test
    fun `M123-B10 - coordinator exception produces EMERGENCY_FAILED presentation`() = runBlocking {
        val store = FakeCoordinatorStore(
            deviceOwner = true,
            managedState = true,
            throwUnexpectedOnEmergencyStart = true,
        )
        val coordinator = PolicyOperationCoordinator(store)
        val presentation = try {
            val outcome = coordinator.startEmergency(10)
            EmergencyStatusEvaluator.evaluate(outcome)
        } catch (ex: Throwable) {
            EmergencyStatusEvaluator.failed(ex.message)
        }

        assertEquals(EmergencyPresentationState.EMERGENCY_FAILED, presentation.state)
        assertTrue(presentation.needsRecoveryRetry)
        assertFalse(store.emergencyActive)
    }

    @Test
    fun `M123-B11 - Device Owner lost during Emergency reports EMERGENCY_ACTIVE_DEGRADED`() = runBlocking {
        val store = FakeCoordinatorStore(
            deviceOwner = true,
            managedState = true,
            savedBlocked = setOf(youtube),
            revokeDeviceOwnerOnDpmCall = true,
        )
        store.trackedSuspended.add(youtube)
        store.osSuspended.add(youtube)

        val coordinator = PolicyOperationCoordinator(store)
        val outcome = coordinator.startEmergency(10)
        val presentation = EmergencyStatusEvaluator.evaluate(outcome)

        assertTrue(outcome.state.emergencyActive)
        assertFalse(outcome.state.deviceOwner)
        assertEquals(setOf(youtube), store.trackedSuspended)
        assertEquals(EmergencyPresentationState.EMERGENCY_ACTIVE_DEGRADED, presentation.state)
        assertTrue(presentation.needsRecoveryRetry)
    }

    @Test
    fun `M123-B12 - Emergency audit uses empty required set and classifies remaining suspended apps as extra`() = runBlocking {
        val store = FakeCoordinatorStore(
            deviceOwner = true,
            managedState = true,
            savedBlocked = setOf(youtube, tiktok),
            failUnsuspend = setOf(youtube),
        )
        store.trackedSuspended.addAll(setOf(youtube, tiktok))
        store.osSuspended.addAll(setOf(youtube, tiktok))

        val coordinator = PolicyOperationCoordinator(store)
        val outcome = coordinator.startEmergency(10)

        assertTrue(outcome.audit.requiredNotSuspended.isEmpty())
        assertEquals(setOf(youtube), outcome.audit.extraSuspended)
        assertEquals(setOf(youtube), outcome.audit.verifiedSuspended)
    }
}
