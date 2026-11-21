package com.focusgate.app.util

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.SystemClock
import android.provider.Settings
import com.focusgate.app.service.EmergencyExpiryReceiver

/**
 * Emergency access temporarily pauses restrictions without uninstalling or
 * disabling protection. It is deliberately bounded and visible in the UI.
 *
 * The window uses elapsedRealtime and the system boot count so a clock change or
 * reboot cannot extend it accidentally.
 */
object EmergencyAccess {
    const val DEFAULT_MINUTES = 10
    const val MAX_MINUTES = 15

    private const val NAME = "focusgate_emergency"
    private const val KEY_UNTIL_ELAPSED = "until_elapsed"
    private const val KEY_BOOT_COUNT = "boot_count"

    fun start(context: Context, minutes: Int = DEFAULT_MINUTES): Long {
        val bounded = minutes.coerceIn(1, MAX_MINUTES)
        val until = SystemClock.elapsedRealtime() + bounded * 60_000L
        prefs(context).edit()
            .putLong(KEY_UNTIL_ELAPSED, until)
            .putInt(KEY_BOOT_COUNT, bootCount(context))
            .apply()
        scheduleExpiry(context, until)
        return until
    }

    fun end(context: Context) {
        prefs(context).edit().clear().apply()
        cancelExpiry(context)
    }

    internal fun scheduleExpiry(context: Context, untilElapsed: Long) {
        val alarmManager = context.getSystemService(AlarmManager::class.java) ?: return
        val pendingIntent = expiryIntent(context)
        // Inexact by design: exact alarms are a restricted permission. If the
        // alarm is delayed, protection resumes on the next app/boot check.
        alarmManager.setAndAllowWhileIdle(
            AlarmManager.ELAPSED_REALTIME_WAKEUP,
            untilElapsed,
            pendingIntent,
        )
    }

    private fun cancelExpiry(context: Context) {
        val alarmManager = context.getSystemService(AlarmManager::class.java) ?: return
        alarmManager.cancel(expiryIntent(context))
    }

    private fun expiryIntent(context: Context): PendingIntent {
        val intent = Intent(context, EmergencyExpiryReceiver::class.java)
        return PendingIntent.getBroadcast(
            context,
            EXPIRY_REQUEST_CODE,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    fun isActive(context: Context): Boolean = remainingMillis(context) > 0L

    fun remainingMillis(context: Context): Long {
        val prefs = prefs(context)
        val until = prefs.getLong(KEY_UNTIL_ELAPSED, 0L)
        if (until <= 0L) return 0L
        if (prefs.getInt(KEY_BOOT_COUNT, -1) != bootCount(context)) {
            end(context)
            return 0L
        }
        return remainingMillis(SystemClock.elapsedRealtime(), until, bootMatches = true)
    }

    /** Pure helper for unit tests. */
    fun remainingMillis(nowElapsed: Long, untilElapsed: Long, bootMatches: Boolean): Long {
        if (!bootMatches) return 0L
        return (untilElapsed - nowElapsed).coerceAtLeast(0L)
    }

    fun clearIfRebooted(context: Context) {
        if (isActive(context)) return
        prefs(context).edit().clear().apply()
    }

    private fun bootCount(context: Context): Int =
        runCatching {
            Settings.Global.getInt(context.contentResolver, Settings.Global.BOOT_COUNT)
        }.getOrDefault(-1)

    private fun prefs(context: Context) =
        context.getSharedPreferences(NAME, Context.MODE_PRIVATE)

    private const val EXPIRY_REQUEST_CODE = 7011
}
