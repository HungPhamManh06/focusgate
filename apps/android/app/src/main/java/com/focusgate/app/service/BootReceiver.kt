package com.focusgate.app.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.content.ContextCompat
import com.focusgate.app.admin.ManagedDeviceController
import com.focusgate.app.data.FocusGateDatabase
import com.focusgate.app.util.AgentPreferences
import com.focusgate.app.util.EmergencyAccess
import com.focusgate.app.util.Notifications
import com.focusgate.app.util.PermissionChecks
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Restores protection after reboot or an app update. Android 15 permits a
 * specialUse foreground service to start from BOOT_COMPLETED; if the OEM still
 * refuses, the UI shows protection as off rather than claiming success.
 */
class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED &&
            intent.action != Intent.ACTION_MY_PACKAGE_REPLACED
        ) {
            return
        }

        EmergencyAccess.clearIfRebooted(context)

        val pendingResult = goAsync()
        val appContext = context.applicationContext
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            try {
                restore(appContext)
            } catch (throwable: Throwable) {
                Log.w(TAG, "Boot restore failed", throwable)
            } finally {
                pendingResult.finish()
            }
        }
    }

    private suspend fun restore(context: Context) {
        val monitorEnabled = AgentPreferences.isMonitorEnabled(context)
        val managedRequested = AgentPreferences.isManagedEnforcementEnabled(context)
        val controller = ManagedDeviceController(context)

        if (monitorEnabled && managedRequested && controller.isDeviceOwner()) {
            val dao = FocusGateDatabase.get(context).blockedAppDao()
            controller.applyBlockedPackages(
                blockedPackages = dao.blockedPackages().toSet(),
                exemptPackages = dao.exemptPackages().toSet(),
            )
            return
        }

        if (!monitorEnabled) {
            if (controller.isDeviceOwner()) {
                controller.clearSuspensions()
            }
            return
        }

        if (!managedRequested && controller.isDeviceOwner()) {
            controller.clearSuspensions()
        }

        if (!PermissionChecks.hasUsageAccess(context)) {
            Notifications.notifyProtectionLost(
                context,
                "Usage Access was revoked. Protection is off until it is granted again.",
            )
            return
        }
        if (!PermissionChecks.hasOverlayAccess(context)) {
            Notifications.notifyProtectionLost(
                context,
                "Display over other apps was revoked. The block screen cannot appear.",
            )
            return
        }

        runCatching {
            ContextCompat.startForegroundService(
                context,
                Intent(context, AppUsageMonitorService::class.java),
            )
        }.onFailure {
            Log.w(TAG, "Could not restore monitoring service", it)
            Notifications.notifyProtectionLost(
                context,
                "Android did not allow monitoring to restart after boot.",
            )
        }
    }

    private companion object {
        const val TAG = "FocusGateBoot"
    }
}
