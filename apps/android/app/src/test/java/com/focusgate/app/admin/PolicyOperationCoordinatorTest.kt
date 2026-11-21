package com.focusgate.app.admin

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
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
    ) : PolicyCoordinatorStore {
        val trackedSuspended = mutableSetOf<String>()
        val osSuspended = mutableSetOf<String>()
        val concurrentDpmCalls = AtomicInteger(0)
        var maxConcurrentDpmCalls = 0
        val callLog = mutableListOf<String>()
        var personalMonitorRunning = false

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
                val active = concurrentDpmCalls.incrementAndGet()
                maxConcurrentDpmCalls = maxOf(maxConcurrentDpmCalls, active)
                try {
                    if (suspended) osSuspended.addAll(packages) else osSuspended.removeAll(packages)
                    return emptySet()
                } finally {
                    concurrentDpmCalls.decrementAndGet()
                }
            }

            override fun querySuspensionState(packageName: String): PackageSuspensionState =
                if (packageName in osSuspended) PackageSuspensionState.SUSPENDED
                else PackageSuspensionState.NOT_SUSPENDED
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
}
