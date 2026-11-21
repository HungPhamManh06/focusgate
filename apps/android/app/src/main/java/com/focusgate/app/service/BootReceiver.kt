package com.focusgate.app.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.focusgate.app.FocusGateApp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Restores protection after reboot or an app update via the serialized
 * [FocusGateApp.coordinator]. Android 15 permits a specialUse foreground
 * service to start from BOOT_COMPLETED; if the OEM still refuses, the UI shows
 * protection as off rather than claiming success.
 */
class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED &&
            intent.action != Intent.ACTION_MY_PACKAGE_REPLACED
        ) {
            return
        }

        val pendingResult = goAsync()
        val appContext = context.applicationContext
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            try {
                FocusGateApp.coordinator(appContext).bootRecover()
            } catch (throwable: Throwable) {
                Log.w(TAG, "Boot restore failed", throwable)
            } finally {
                pendingResult.finish()
            }
        }
    }

    private companion object {
        const val TAG = "FocusGateBoot"
    }
}
