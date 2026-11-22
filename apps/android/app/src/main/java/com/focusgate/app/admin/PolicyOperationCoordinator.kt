package com.focusgate.app.admin

import com.focusgate.app.policy.PolicyEvaluator
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

data class PolicyRuntimeState(
    val monitorEnabled: Boolean,
    val managedEnabled: Boolean,
    val deviceOwner: Boolean,
    val emergencyActive: Boolean,
    val savedBlocked: Set<String>,
    val savedExempt: Set<String>,
    val ownPackage: String,
    val deviceEssential: Set<String>,
)

data class PolicyOperationOutcome(
    val state: PolicyRuntimeState,
    val audit: ManagedPolicyAudit,
    val applyResult: ManagedApplyResult? = null,
    val bannerMessage: String? = null,
    val savedSuccessfully: Boolean = true,
)

interface PolicyCoordinatorStore {
    suspend fun readRuntimeState(): PolicyRuntimeState
    suspend fun saveRules(blocked: Set<String>, exempt: Set<String>): Boolean
    fun setMonitorEnabled(enabled: Boolean)
    fun setManagedEnabled(enabled: Boolean)
    fun startEmergency(minutes: Int)
    fun endEmergency()
    fun clearEmergencyIfRebooted()
    fun startPersonalMonitor(): Boolean
    fun stopPersonalMonitor()
    fun auditManaged(requiredPackages: Set<String>): ManagedPolicyAudit
    fun applyManaged(blocked: Set<String>, exempt: Set<String>): ManagedApplyResult
    fun clearManaged(): ManagedApplyResult
    fun isManagedFlavor(): Boolean
    fun hasPersonalPermissions(): Boolean
    fun notifyProtectionLost(message: String)
}

/**
 * Serializes all policy, mode, emergency, and boot-recovery transitions under
 * a single Mutex so two DPM operations can never run concurrently or apply
 * stale mode/policy snapshots after a newer transition.
 */
class PolicyOperationCoordinator(
    private val store: PolicyCoordinatorStore,
) {
    private val mutex = Mutex()

    suspend fun auditCurrentPolicy(): PolicyOperationOutcome = mutex.withLock {
        val state = store.readRuntimeState()
        val audit = computeAudit(state)
        PolicyOperationOutcome(state = state, audit = audit)
    }

    suspend fun reconcileCurrentPolicy(reason: String = "reconcile"): PolicyOperationOutcome =
        mutex.withLock {
            reconcileLocked(reason)
        }

    suspend fun bootRecover(): PolicyOperationOutcome = mutex.withLock {
        store.clearEmergencyIfRebooted()
        reconcileLocked("boot")
    }

    suspend fun savePolicy(
        blocked: Set<String>,
        exempt: Set<String>,
    ): PolicyOperationOutcome = mutex.withLock {
        val saved = store.saveRules(blocked, exempt)
        if (!saved) {
            val current = store.readRuntimeState()
            return@withLock PolicyOperationOutcome(
                state = current,
                audit = computeAudit(current),
                bannerMessage = "Could not save policy. Active protection still uses the previous saved policy.",
                savedSuccessfully = false,
            )
        }

        val outcome = reconcileLocked("save")
        val banner = outcome.applyResult?.message
            ?: "Policy saved. The monitor reads it immediately."
        outcome.copy(bannerMessage = banner, savedSuccessfully = true)
    }

    suspend fun applyManagedPolicy(): PolicyOperationOutcome = mutex.withLock {
        val state = store.readRuntimeState()
        if (!state.deviceOwner) {
            return@withLock PolicyOperationOutcome(
                state = state,
                audit = computeAudit(state),
                bannerMessage = "Device Owner provisioning is required for Managed Device mode.",
            )
        }
        reconcileLocked("apply_managed")
    }

    suspend fun restoreSuspendedApps(): PolicyOperationOutcome = mutex.withLock {
        val state = store.readRuntimeState()
        if (!state.deviceOwner) {
            return@withLock PolicyOperationOutcome(
                state = state,
                audit = computeAudit(state),
                bannerMessage = "Device Owner permission is missing.",
            )
        }
        val clearResult = store.clearManaged()
        val refreshed = store.readRuntimeState()
        val audit = computeAudit(refreshed)
        PolicyOperationOutcome(
            state = refreshed,
            audit = audit,
            applyResult = clearResult,
            bannerMessage = clearResult.message,
        )
    }

    suspend fun setMonitoring(enabled: Boolean): PolicyOperationOutcome = mutex.withLock {
        val before = store.readRuntimeState()
        if (!enabled) {
            store.setMonitorEnabled(false)
            store.stopPersonalMonitor()
            val outcome = reconcileLocked("disable_monitoring")
            return@withLock outcome.copy(
                bannerMessage = outcome.applyResult?.takeIf { !it.applied }?.message
                    ?: "Protection is off. Selected apps are not being restricted.",
            )
        }

        val managedActive = store.isManagedFlavor() && before.managedEnabled && before.deviceOwner
        if (!managedActive && !store.hasPersonalPermissions()) {
            return@withLock PolicyOperationOutcome(
                state = before,
                audit = computeAudit(before),
                bannerMessage = "Grant Usage Access and Display over other apps before enabling protection.",
            )
        }

        store.setMonitorEnabled(true)
        reconcileLocked("enable_monitoring")
    }

    suspend fun setManagedMode(enabled: Boolean): PolicyOperationOutcome = mutex.withLock {
        val before = store.readRuntimeState()
        if (enabled && !before.deviceOwner) {
            return@withLock PolicyOperationOutcome(
                state = before,
                audit = computeAudit(before),
                bannerMessage = "Device Owner provisioning is required for Managed Device mode.",
            )
        }

        store.setManagedEnabled(enabled)
        if (enabled) {
            store.setMonitorEnabled(true)
        }
        val outcome = reconcileLocked(if (enabled) "enable_managed" else "disable_managed")
        if (!enabled) {
            val banner = when {
                !outcome.state.deviceOwner && outcome.audit.unknownPackages.isNotEmpty() ->
                    "Switched to Personal Mode, but ${outcome.audit.unknownPackages.size} app(s) cannot be verified or resumed without Device Owner."
                !outcome.state.deviceOwner ->
                    "Switched to Personal Mode."
                outcome.applyResult != null ->
                    outcome.applyResult.message
                else ->
                    "Switched to Personal Mode."
            }
            outcome.copy(bannerMessage = banner)
        } else {
            outcome
        }
    }

    suspend fun startEmergency(minutes: Int): PolicyOperationOutcome = mutex.withLock {
        store.startEmergency(minutes)
        val outcome = reconcileLocked("start_emergency")
        val presentation = EmergencyStatusEvaluator.evaluate(outcome)
        outcome.copy(bannerMessage = presentation.message)
    }

    suspend fun endEmergency(): PolicyOperationOutcome = mutex.withLock {
        store.endEmergency()
        val outcome = reconcileLocked("end_emergency")
        outcome.copy(
            bannerMessage = outcome.applyResult?.takeIf { !it.applied }?.message
                ?: "Emergency access ended.",
        )
    }

    private suspend fun reconcileLocked(reason: String): PolicyOperationOutcome {
        val state = store.readRuntimeState()
        var applyResult: ManagedApplyResult? = null
        var banner: String? = null

        if (!state.monitorEnabled) {
            store.stopPersonalMonitor()
            if (store.isManagedFlavor() && state.deviceOwner) {
                val preAudit = store.auditManaged(emptySet())
                if (preAudit.trackedPackages.isNotEmpty() || preAudit.hasLingeringSuspensions) {
                    applyResult = store.clearManaged()
                    banner = applyResult.message
                }
            }
        } else if (state.emergencyActive) {
            if (store.isManagedFlavor() && state.deviceOwner) {
                val preAudit = store.auditManaged(emptySet())
                if (preAudit.trackedPackages.isNotEmpty() || preAudit.hasLingeringSuspensions) {
                    applyResult = store.clearManaged()
                    banner = applyResult.message
                }
            }
        } else if (store.isManagedFlavor() && state.managedEnabled && state.deviceOwner) {
            store.stopPersonalMonitor()
            applyResult = store.applyManaged(state.savedBlocked, state.savedExempt)
            banner = applyResult.message
        } else if (store.isManagedFlavor() && state.managedEnabled && !state.deviceOwner) {
            banner = "Device Owner permission was lost."
        } else {
            // Personal Mode (either personal flavor or managed flavor with managedEnabled=false).
            if (store.isManagedFlavor() && state.deviceOwner) {
                val preAudit = store.auditManaged(emptySet())
                if (preAudit.trackedPackages.isNotEmpty() || preAudit.hasLingeringSuspensions) {
                    applyResult = store.clearManaged()
                    banner = applyResult.message
                }
            }
            if (store.hasPersonalPermissions()) {
                val started = store.startPersonalMonitor()
                if (!started) {
                    banner = if (reason == "boot") {
                        store.notifyProtectionLost("Android did not allow monitoring to restart after boot.")
                        null
                    } else {
                        "Android refused to start monitoring. Check permissions and try again."
                    }
                }
            } else if (reason == "boot") {
                store.notifyProtectionLost(
                    "Required permissions were revoked. Protection is off until granted again.",
                )
            }
        }

        val finalState = store.readRuntimeState()
        val finalAudit = computeAudit(finalState)
        return PolicyOperationOutcome(
            state = finalState,
            audit = finalAudit,
            applyResult = applyResult,
            bannerMessage = banner,
        )
    }

    private fun computeAudit(state: PolicyRuntimeState): ManagedPolicyAudit {
        if (!store.isManagedFlavor()) {
            return ManagedPolicyAudit(deviceOwnerValid = false)
        }
        // During Emergency Access, Managed DPM target is empty so any apps
        // remaining suspended are reported as extra/lingering rather than required.
        val required = if (state.managedEnabled && !state.emergencyActive) {
            PolicyEvaluator.effectiveBlocked(
                blockedPackages = state.savedBlocked,
                exemptPackages = state.savedExempt,
                ownPackage = state.ownPackage,
                deviceEssential = state.deviceEssential,
            )
        } else {
            emptySet()
        }
        return store.auditManaged(required)
    }
}
