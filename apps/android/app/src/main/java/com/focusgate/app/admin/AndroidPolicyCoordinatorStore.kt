package com.focusgate.app.admin

import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat
import com.focusgate.app.BuildConfig
import com.focusgate.app.data.BlockedApp
import com.focusgate.app.data.FocusGateDatabase
import com.focusgate.app.policy.PolicyEvaluator
import com.focusgate.app.service.AppUsageMonitorService
import com.focusgate.app.util.AgentPreferences
import com.focusgate.app.util.EmergencyAccess
import com.focusgate.app.util.Notifications
import com.focusgate.app.util.PermissionChecks
import com.focusgate.app.util.ProtectionWatchdog
import com.focusgate.app.util.SystemPackages
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Android-backed implementation of [PolicyCoordinatorStore].
 *
 * All reads and writes go directly to authoritative sources (Room DB,
 * SharedPreferences, DevicePolicyManager, PackageManager) on IO when needed,
 * never relying on stale Compose UI snapshots.
 */
class AndroidPolicyCoordinatorStore(context: Context) : PolicyCoordinatorStore {

    private val appContext = context.applicationContext
    private val database by lazy { FocusGateDatabase.get(appContext) }
    private val managedController by lazy { ManagedDeviceController(appContext) }

    override suspend fun readRuntimeState(): PolicyRuntimeState = withContext(Dispatchers.IO) {
        val dao = database.blockedAppDao()
        PolicyRuntimeState(
            monitorEnabled = AgentPreferences.isMonitorEnabled(appContext),
            managedEnabled = AgentPreferences.isManagedEnforcementEnabled(appContext),
            deviceOwner = managedController.isDeviceOwner(),
            emergencyActive = EmergencyAccess.isActive(appContext),
            savedBlocked = dao.blockedPackages().toSet(),
            savedExempt = dao.exemptPackages().toSet(),
            ownPackage = appContext.packageName,
            deviceEssential = SystemPackages.deviceEssential(appContext),
        )
    }

    override suspend fun saveRules(
        blocked: Set<String>,
        exempt: Set<String>,
    ): Boolean = withContext(Dispatchers.IO) {
        runCatching {
            val pm = appContext.packageManager
            val rows = (blocked + exempt).map { pkg ->
                val label = runCatching {
                    pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString()
                }.getOrDefault(pkg)
                BlockedApp(
                    packageName = pkg,
                    label = label,
                    category = PolicyEvaluator.categoryFor(pkg, label),
                    enabled = true,
                    isExempt = pkg in exempt,
                )
            }
            database.blockedAppDao().replaceAll(rows)
        }.isSuccess
    }

    override fun setMonitorEnabled(enabled: Boolean) {
        AgentPreferences.setMonitorEnabled(appContext, enabled)
    }

    override fun setManagedEnabled(enabled: Boolean) {
        AgentPreferences.setManagedEnforcementEnabled(appContext, enabled)
    }

    override fun startEmergency(minutes: Int) {
        EmergencyAccess.start(appContext, minutes)
    }

    override fun endEmergency() {
        EmergencyAccess.end(appContext)
    }

    override fun clearEmergencyIfRebooted() {
        EmergencyAccess.clearIfRebooted(appContext)
    }

    override fun startPersonalMonitor(): Boolean {
        ProtectionWatchdog.schedule(appContext)
        return runCatching {
            ContextCompat.startForegroundService(
                appContext,
                Intent(appContext, AppUsageMonitorService::class.java),
            )
            true
        }.getOrDefault(false)
    }

    override fun stopPersonalMonitor() {
        appContext.stopService(Intent(appContext, AppUsageMonitorService::class.java))
        ProtectionWatchdog.cancel(appContext)
    }

    override fun auditManaged(requiredPackages: Set<String>): ManagedPolicyAudit {
        // Delegate to ManagedDeviceController's audit using the exact required set.
        return managedController.auditRequiredPackages(requiredPackages)
    }

    override fun applyManaged(
        blocked: Set<String>,
        exempt: Set<String>,
    ): ManagedApplyResult = managedController.applyBlockedPackages(blocked, exempt)

    override fun clearManaged(): ManagedApplyResult = managedController.clearSuspensions()

    override fun isManagedFlavor(): Boolean = BuildConfig.MANAGED_MODE

    override fun hasPersonalPermissions(): Boolean =
        PermissionChecks.hasUsageAccess(appContext) &&
            PermissionChecks.hasOverlayAccess(appContext)

    override fun notifyProtectionLost(message: String) {
        Notifications.notifyProtectionLost(appContext, message)
    }
}
