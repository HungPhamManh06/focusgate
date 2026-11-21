package com.focusgate.app.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.SystemClock
import android.util.Log
import com.focusgate.app.admin.ManagedDeviceController
import com.focusgate.app.data.FocusGateDatabase
import com.focusgate.app.util.AgentPreferences
import com.focusgate.app.util.EmergencyAccess
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * The emergency window is bounded. When it ends, re-apply managed-device
 * suspensions that were lifted for the window. Personal mode is re-armed by the
 * running foreground service as soon as the window expires.
 */
class EmergencyExpiryReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val appContext = context.applicationContext
        val remaining = EmergencyAccess.remainingMillis(appContext)
        if (remaining > 0L) {
            EmergencyAccess.scheduleExpiry(
                appContext,
                SystemClock.elapsedRealtime() + remaining,
            )
            return
        }

        EmergencyAccess.end(appContext)

        val pendingResult = goAsync()
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            try {
                if (!AgentPreferences.isMonitorEnabled(appContext) ||
                    !AgentPreferences.isManagedEnforcementEnabled(appContext)
                ) {
                    return@launch
                }
                val controller = ManagedDeviceController(appContext)
                if (!controller.isDeviceOwner()) return@launch

                val dao = FocusGateDatabase.get(appContext).blockedAppDao()
                val result = controller.applyBlockedPackages(
                    blockedPackages = dao.blockedPackages().toSet(),
                    exemptPackages = dao.exemptPackages().toSet(),
                )
                if (!result.applied) {
                    Log.w(TAG, result.message)
                }
            } catch (throwable: Throwable) {
                Log.w(TAG, "Could not restore policy after emergency access", throwable)
            } finally {
                pendingResult.finish()
            }
        }
    }

    private companion object {
        const val TAG = "FocusGateEmergency"
    }
}
