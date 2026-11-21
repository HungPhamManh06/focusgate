package com.focusgate.app.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.SystemClock
import android.util.Log
import com.focusgate.app.FocusGateApp
import com.focusgate.app.util.EmergencyAccess
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * The emergency window is bounded. When it ends, re-reconcile policy via
 * [FocusGateApp.coordinator] so the latest saved policy and mode are applied.
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

        val pendingResult = goAsync()
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            try {
                val outcome = FocusGateApp.coordinator(appContext).endEmergency()
                val applyResult = outcome.applyResult
                if (applyResult != null && !applyResult.applied) {
                    Log.w(TAG, applyResult.message)
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
