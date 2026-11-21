package com.focusgate.app.util

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.focusgate.app.R
import com.focusgate.app.service.AppUsageMonitorService
import java.util.concurrent.TimeUnit

object ProtectionWatchdog {
    private const val WORK_NAME = "focusgate_protection_watchdog"

    fun schedule(context: Context) {
        val request = PeriodicWorkRequestBuilder<ProtectionWatchdogWorker>(15, TimeUnit.MINUTES)
            .setInitialDelay(15, TimeUnit.MINUTES)
            .build()

        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            WORK_NAME,
            ExistingPeriodicWorkPolicy.UPDATE,
            request,
        )
    }

    fun cancel(context: Context) {
        WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME)
    }
}

class ProtectionWatchdogWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val context = applicationContext
        if (!AgentPreferences.isMonitorEnabled(context)) return Result.success()
        if (AgentPreferences.isManagedEnforcementEnabled(context)) return Result.success()

        if (!PermissionChecks.hasUsageAccess(context) ||
            !PermissionChecks.hasOverlayAccess(context)
        ) {
            Notifications.notifyProtectionLost(
                context,
                "A required permission is missing. Open FocusGate to restore protection.",
            )
            return Result.success()
        }

        if (!AppUsageMonitorService.isRunning) {
            Notifications.notifyProtectionLost(
                context,
                context.getString(R.string.notification_watchdog_body),
            )
        }
        return Result.success()
    }
}
