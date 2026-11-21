package com.focusgate.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import com.focusgate.app.admin.AndroidPolicyCoordinatorStore
import com.focusgate.app.admin.PolicyOperationCoordinator
import com.focusgate.app.util.NotificationIds
import com.focusgate.app.util.ProtectionWatchdog

class FocusGateApp : Application() {

    val policyCoordinator: PolicyOperationCoordinator by lazy {
        PolicyOperationCoordinator(AndroidPolicyCoordinatorStore(this))
    }

    override fun onCreate() {
        super.onCreate()
        createChannels()
        ProtectionWatchdog.schedule(this)
    }

    companion object {
        fun coordinator(context: Context): PolicyOperationCoordinator {
            val app = context.applicationContext as? FocusGateApp
            return app?.policyCoordinator
                ?: PolicyOperationCoordinator(AndroidPolicyCoordinatorStore(context.applicationContext))
        }
    }

    private fun createChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        val manager = getSystemService(NotificationManager::class.java) ?: return

        val protection = NotificationChannel(
            NotificationIds.CHANNEL_PROTECTION,
            getString(R.string.notification_channel_name),
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = getString(R.string.notification_channel_description)
            setShowBadge(false)
        }

        val alerts = NotificationChannel(
            NotificationIds.CHANNEL_ALERTS,
            getString(R.string.notification_alerts_channel_name),
            NotificationManager.IMPORTANCE_DEFAULT,
        ).apply {
            description = getString(R.string.notification_alerts_channel_description)
        }

        manager.createNotificationChannels(listOf(protection, alerts))
    }
}
