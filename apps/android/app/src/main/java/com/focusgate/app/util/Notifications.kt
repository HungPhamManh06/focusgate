package com.focusgate.app.util

import android.app.Notification
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.focusgate.app.R
import com.focusgate.app.admin.EmergencyPresentationState
import com.focusgate.app.admin.EmergencyStatusPresentation
import com.focusgate.app.ui.MainActivity

object NotificationIds {
    const val CHANNEL_PROTECTION = "focusgate_protection"
    const val CHANNEL_ALERTS = "focusgate_alerts"
    const val MONITOR_NOTIFICATION = 1001
    const val PROTECTION_ALERT = 1002
    const val BLOCK_FAILED_ALERT = 1003
    const val EMERGENCY_ALERT = 1004
    const val LIVE_FOCUS_NOTIFICATION = 1005
}

object Notifications {
    private const val TAG = "FocusGateNotifications"

    fun monitorNotification(
        context: Context,
        usageGranted: Boolean,
        overlayGranted: Boolean,
        emergencyActive: Boolean = false,
        emergencyPresentation: EmergencyStatusPresentation? = null,
    ): Notification {
        val contentIntent = PendingIntent.getActivity(
            context,
            0,
            Intent(context, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val text = when {
            !usageGranted -> context.getString(R.string.notification_usage_missing)
            !overlayGranted -> context.getString(R.string.notification_overlay_missing)
            emergencyPresentation?.state == EmergencyPresentationState.EMERGENCY_FAILED ->
                emergencyPresentation.message
            emergencyPresentation?.state == EmergencyPresentationState.EMERGENCY_ACTIVE_DEGRADED ->
                emergencyPresentation.message
            emergencyActive || emergencyPresentation?.state == EmergencyPresentationState.EMERGENCY_ACTIVE ->
                emergencyPresentation?.message ?: context.getString(R.string.notification_emergency_active)
            else -> context.getString(R.string.notification_text)
        }

        return NotificationCompat.Builder(context, NotificationIds.CHANNEL_PROTECTION)
            .setSmallIcon(android.R.drawable.ic_lock_lock)
            .setContentTitle(context.getString(R.string.notification_title))
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(contentIntent)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()
    }

    fun updateMonitorNotification(
        context: Context,
        usageGranted: Boolean,
        overlayGranted: Boolean,
        emergencyActive: Boolean = false,
        emergencyPresentation: EmergencyStatusPresentation? = null,
    ) {
        post(
            context,
            NotificationIds.MONITOR_NOTIFICATION,
            monitorNotification(
                context = context,
                usageGranted = usageGranted,
                overlayGranted = overlayGranted,
                emergencyActive = emergencyActive,
                emergencyPresentation = emergencyPresentation,
            ),
        )
    }

    fun notifyEmergencyIssue(context: Context, presentation: EmergencyStatusPresentation) {
        if (presentation.state != EmergencyPresentationState.EMERGENCY_ACTIVE_DEGRADED &&
            presentation.state != EmergencyPresentationState.EMERGENCY_FAILED
        ) {
            return
        }
        val title = if (presentation.state == EmergencyPresentationState.EMERGENCY_FAILED) {
            "Emergency access could not be verified"
        } else {
            "Emergency access partial restore"
        }
        val contentIntent = PendingIntent.getActivity(
            context,
            0,
            Intent(context, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(context, NotificationIds.CHANNEL_ALERTS)
            .setSmallIcon(android.R.drawable.stat_sys_warning)
            .setContentTitle(title)
            .setContentText(presentation.message)
            .setStyle(NotificationCompat.BigTextStyle().bigText(presentation.message))
            .setContentIntent(contentIntent)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .build()
        post(context, NotificationIds.EMERGENCY_ALERT, notification)
    }

    fun notifyProtectionLost(context: Context, reason: String) {
        val notification = NotificationCompat.Builder(context, NotificationIds.CHANNEL_ALERTS)
            .setSmallIcon(android.R.drawable.stat_sys_warning)
            .setContentTitle(context.getString(R.string.notification_protection_off_title))
            .setContentText(reason)
            .setStyle(NotificationCompat.BigTextStyle().bigText(reason))
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .build()
        post(context, NotificationIds.PROTECTION_ALERT, notification)
    }

    fun notifyBlockScreenFailed(context: Context, packageName: String) {
        val notification = NotificationCompat.Builder(context, NotificationIds.CHANNEL_ALERTS)
            .setSmallIcon(android.R.drawable.stat_sys_warning)
            .setContentTitle(context.getString(R.string.notification_block_failed_title))
            .setContentText(context.getString(R.string.notification_block_failed_body, packageName))
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .build()
        post(context, NotificationIds.BLOCK_FAILED_ALERT, notification)
    }

    fun showLiveFocusNotification(
        context: Context,
        taskTitle: String,
        endsAtEpochMs: Long,
        isPaused: Boolean = false,
    ) {
        val isVi = AgentPreferences.getLanguage(context) == "vi"
        val openIntent = PendingIntent.getActivity(
            context,
            20,
            Intent(context, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val completeIntent = PendingIntent.getBroadcast(
            context,
            21,
            Intent(context, com.focusgate.app.service.FocusNotificationActionReceiver::class.java).apply {
                action = com.focusgate.app.service.FocusNotificationActionReceiver.ACTION_COMPLETE_FOCUS
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val pauseIntent = PendingIntent.getBroadcast(
            context,
            22,
            Intent(context, com.focusgate.app.service.FocusNotificationActionReceiver::class.java).apply {
                action = com.focusgate.app.service.FocusNotificationActionReceiver.ACTION_PAUSE_FOCUS
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val builder = NotificationCompat.Builder(context, NotificationIds.CHANNEL_PROTECTION)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle(if (isVi) "Đang tập trung · $taskTitle" else "Focusing · $taskTitle")
            .setContentText(
                if (isPaused) {
                    if (isVi) "Đã tạm dừng — chạm để tiếp tục" else "Paused — tap to resume"
                } else {
                    if (isVi) "Cổng giải trí đang khóa cho đến khi xong phiên" else "Leisure gate locked until sprint ends"
                },
            )
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(openIntent)
            .addAction(
                android.R.drawable.ic_menu_save,
                if (isVi) "Hoàn thành" else "Complete",
                completeIntent,
            )
            .addAction(
                android.R.drawable.ic_media_pause,
                if (isVi) "Nghỉ ngắn" else "Short break",
                pauseIntent,
            )

        if (!isPaused && endsAtEpochMs > System.currentTimeMillis()) {
            builder
                .setWhen(endsAtEpochMs)
                .setShowWhen(true)
                .setUsesChronometer(true)
                .setChronometerCountDown(true)
        }

        post(context, NotificationIds.LIVE_FOCUS_NOTIFICATION, builder.build())
    }

    fun cancelLiveFocusNotification(context: Context) {
        NotificationManagerCompat.from(context).cancel(NotificationIds.LIVE_FOCUS_NOTIFICATION)
    }

    private fun post(context: Context, id: Int, notification: Notification) {
        try {
            NotificationManagerCompat.from(context).notify(id, notification)
        } catch (exception: SecurityException) {
            // POST_NOTIFICATIONS was denied; the in-app status screen still works.
            Log.w(TAG, "Notification permission missing", exception)
        }
    }
}
