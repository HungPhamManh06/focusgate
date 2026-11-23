package com.focusgate.app.util

import android.content.Context
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

object AgentPreferences {
    private const val NAME = "focusgate"
    private const val KEY_ONBOARDING_COMPLETE = "onboarding_complete"
    private const val KEY_PRIVACY_CONSENT = "privacy_consent"
    private const val KEY_MONITOR_ENABLED = "monitor_enabled"
    private const val KEY_MANAGED_ENFORCEMENT = "managed_enforcement"
    private const val KEY_ACCESS_TOKEN = "access_token"
    private const val KEY_REFRESH_TOKEN = "refresh_token"
    private const val KEY_USER_EMAIL = "user_email"
    private const val KEY_DEVICE_ID = "device_id"
    private const val KEY_PLAN_UNLOCKED = "plan_unlocked"
    private const val KEY_LAST_SYNC_AT = "last_sync_at"
    private const val KEY_LAST_SYNCED_USAGE_ID = "last_synced_usage_id"
    private const val KEY_STRICT_NO_EMERGENCY = "strict_no_emergency"
    private const val KEY_EMERGENCY_LAST_DATE = "emergency_last_date"
    private const val KEY_BEDTIME_ENABLED = "bedtime_enabled"
    private const val KEY_PLAN_SUMMARY_TEXT = "plan_summary_text"

    const val DEFAULT_API_BASE_URL = "https://focusgate-blue.vercel.app"
    const val DEFAULT_SUPABASE_URL = "https://dyfdeceiszmxozdqugon.supabase.co"
    const val DEFAULT_SUPABASE_ANON_KEY = "sb_publishable_TPpxronGIazapp2ylFORIw_ejce1q9C"

    private fun prefs(context: Context) =
        context.getSharedPreferences(NAME, Context.MODE_PRIVATE)

    fun isOnboardingComplete(context: Context): Boolean =
        prefs(context).getBoolean(KEY_ONBOARDING_COMPLETE, false)

    fun setOnboardingComplete(context: Context, complete: Boolean) {
        prefs(context).edit().putBoolean(KEY_ONBOARDING_COMPLETE, complete).apply()
    }

    fun hasPrivacyConsent(context: Context): Boolean =
        prefs(context).getBoolean(KEY_PRIVACY_CONSENT, false)

    fun setPrivacyConsent(context: Context, consent: Boolean) {
        prefs(context).edit().putBoolean(KEY_PRIVACY_CONSENT, consent).apply()
    }

    fun isMonitorEnabled(context: Context): Boolean =
        prefs(context).getBoolean(KEY_MONITOR_ENABLED, false)

    fun setMonitorEnabled(context: Context, enabled: Boolean) {
        prefs(context).edit().putBoolean(KEY_MONITOR_ENABLED, enabled).apply()
    }

    fun isManagedEnforcementEnabled(context: Context): Boolean =
        prefs(context).getBoolean(KEY_MANAGED_ENFORCEMENT, false)

    fun setManagedEnforcementEnabled(context: Context, enabled: Boolean) {
        prefs(context).edit().putBoolean(KEY_MANAGED_ENFORCEMENT, enabled).apply()
    }

    fun getAccessToken(context: Context): String? =
        prefs(context).getString(KEY_ACCESS_TOKEN, null)?.takeIf { it.isNotBlank() }

    fun getRefreshToken(context: Context): String? =
        prefs(context).getString(KEY_REFRESH_TOKEN, null)?.takeIf { it.isNotBlank() }

    fun getUserEmail(context: Context): String? =
        prefs(context).getString(KEY_USER_EMAIL, null)?.takeIf { it.isNotBlank() }

    fun saveAuthSession(
        context: Context,
        accessToken: String,
        refreshToken: String,
        email: String,
    ) {
        prefs(context).edit()
            .putString(KEY_ACCESS_TOKEN, accessToken)
            .putString(KEY_REFRESH_TOKEN, refreshToken)
            .putString(KEY_USER_EMAIL, email)
            .apply()
    }

    fun clearAuthSession(context: Context) {
        prefs(context).edit()
            .remove(KEY_ACCESS_TOKEN)
            .remove(KEY_REFRESH_TOKEN)
            .remove(KEY_USER_EMAIL)
            .remove(KEY_DEVICE_ID)
            .putBoolean(KEY_PLAN_UNLOCKED, false)
            .remove(KEY_LAST_SYNC_AT)
            .apply()
    }

    fun getDeviceId(context: Context): String? =
        prefs(context).getString(KEY_DEVICE_ID, null)?.takeIf { it.isNotBlank() }

    fun setDeviceId(context: Context, deviceId: String) {
        prefs(context).edit().putString(KEY_DEVICE_ID, deviceId).apply()
    }

    fun isPlanUnlocked(context: Context): Boolean =
        prefs(context).getBoolean(KEY_PLAN_UNLOCKED, false)

    fun setPlanUnlocked(context: Context, unlocked: Boolean) {
        prefs(context).edit().putBoolean(KEY_PLAN_UNLOCKED, unlocked).apply()
    }

    fun getLastSyncAt(context: Context): Long =
        prefs(context).getLong(KEY_LAST_SYNC_AT, 0L)

    fun setLastSyncAt(context: Context, timestampMs: Long) {
        prefs(context).edit().putLong(KEY_LAST_SYNC_AT, timestampMs).apply()
    }

    fun getLastSyncedUsageId(context: Context): Long =
        prefs(context).getLong(KEY_LAST_SYNCED_USAGE_ID, 0L)

    fun setLastSyncedUsageId(context: Context, usageId: Long) {
        prefs(context).edit().putLong(KEY_LAST_SYNCED_USAGE_ID, usageId).apply()
    }

    fun isStrictNoEmergency(context: Context): Boolean =
        prefs(context).getBoolean(KEY_STRICT_NO_EMERGENCY, false)

    fun setStrictNoEmergency(context: Context, strict: Boolean) {
        prefs(context).edit().putBoolean(KEY_STRICT_NO_EMERGENCY, strict).apply()
    }

    fun canUseEmergencyToday(context: Context): Boolean {
        if (isStrictNoEmergency(context)) return false
        val today = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
        return prefs(context).getString(KEY_EMERGENCY_LAST_DATE, null) != today
    }

    fun markEmergencyUsedToday(context: Context) {
        val today = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
        prefs(context).edit().putString(KEY_EMERGENCY_LAST_DATE, today).apply()
    }

    fun isBedtimeEnabled(context: Context): Boolean =
        prefs(context).getBoolean(KEY_BEDTIME_ENABLED, false)

    fun setBedtimeEnabled(context: Context, enabled: Boolean) {
        prefs(context).edit().putBoolean(KEY_BEDTIME_ENABLED, enabled).apply()
    }

    fun isCurrentlyBedtime(context: Context): Boolean {
        if (!isBedtimeEnabled(context)) return false
        val hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
        return hour >= 23 || hour < 6
    }

    fun getPlanSummaryText(context: Context): String =
        prefs(context).getString(KEY_PLAN_SUMMARY_TEXT, "Sync to load today's tasks")
            ?: "Sync to load today's tasks"

    fun setPlanSummaryText(context: Context, text: String) {
        prefs(context).edit().putString(KEY_PLAN_SUMMARY_TEXT, text).apply()
    }
}
