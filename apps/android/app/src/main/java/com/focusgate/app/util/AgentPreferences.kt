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
    private const val KEY_EARNED_MINUTES = "earned_minutes_balance"
    private const val KEY_WHITELIST_FOCUS_MODE = "whitelist_focus_mode"
    private const val KEY_ACTIVE_FOCUS_RUNNING = "active_focus_running"
    private const val KEY_BEDTIME_START = "bedtime_start"
    private const val KEY_BEDTIME_END = "bedtime_end"
    private const val KEY_SETTINGS_GUARD_ENABLED = "settings_guard_enabled"

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
        val cal = Calendar.getInstance()
        val nowMinutes = cal.get(Calendar.HOUR_OF_DAY) * 60 + cal.get(Calendar.MINUTE)
        return com.focusgate.app.policy.BedtimeScheduleEvaluator.isInBedtimeWindow(
            nowMinutesOfDay = nowMinutes,
            startHhMm = getBedtimeStart(context),
            endHhMm = getBedtimeEnd(context),
            enabled = isBedtimeEnabled(context),
        )
    }

    private fun parseHhMm(raw: String?, fallbackMinutes: Int): Int {
        if (raw.isNullOrBlank()) return fallbackMinutes
        val parts = raw.trim().split(":")
        val h = parts.getOrNull(0)?.toIntOrNull() ?: return fallbackMinutes
        val m = parts.getOrNull(1)?.toIntOrNull() ?: 0
        return (h.coerceIn(0, 23) * 60) + m.coerceIn(0, 59)
    }

    fun getBedtimeStart(context: Context): String =
        prefs(context).getString(KEY_BEDTIME_START, "23:00") ?: "23:00"

    fun getBedtimeEnd(context: Context): String =
        prefs(context).getString(KEY_BEDTIME_END, "06:00") ?: "06:00"

    fun setBedtimeWindow(context: Context, start: String?, end: String?) {
        prefs(context).edit()
            .putString(KEY_BEDTIME_START, start ?: "23:00")
            .putString(KEY_BEDTIME_END, end ?: "06:00")
            .apply()
    }

    fun getEarnedMinutesBalance(context: Context): Int =
        prefs(context).getInt(KEY_EARNED_MINUTES, 0)

    fun setEarnedMinutesBalance(context: Context, minutes: Int) {
        prefs(context).edit().putInt(KEY_EARNED_MINUTES, minutes.coerceAtLeast(0)).apply()
    }

    fun isWhitelistFocusMode(context: Context): Boolean =
        prefs(context).getBoolean(KEY_WHITELIST_FOCUS_MODE, false)

    fun setWhitelistFocusMode(context: Context, enabled: Boolean) {
        prefs(context).edit().putBoolean(KEY_WHITELIST_FOCUS_MODE, enabled).apply()
    }

    fun isActiveFocusRunning(context: Context): Boolean =
        prefs(context).getBoolean(KEY_ACTIVE_FOCUS_RUNNING, false)

    fun setActiveFocusRunning(context: Context, running: Boolean) {
        prefs(context).edit().putBoolean(KEY_ACTIVE_FOCUS_RUNNING, running).apply()
    }

    fun isSettingsGuardEnabled(context: Context): Boolean =
        prefs(context).getBoolean(KEY_SETTINGS_GUARD_ENABLED, false)

    fun setSettingsGuardEnabled(context: Context, enabled: Boolean) {
        prefs(context).edit().putBoolean(KEY_SETTINGS_GUARD_ENABLED, enabled).apply()
    }

    fun getPlanSummaryText(context: Context): String =
        prefs(context).getString(KEY_PLAN_SUMMARY_TEXT, "Sync to load today's tasks")
            ?: "Sync to load today's tasks"

    fun setPlanSummaryText(context: Context, text: String) {
        prefs(context).edit().putString(KEY_PLAN_SUMMARY_TEXT, text).apply()
    }

    fun getLanguage(context: Context): String =
        if (prefs(context).getString("policy_language", "en") == "vi") "vi" else "en"

    fun setLanguage(context: Context, language: String) {
        val normalized = if (language == "vi") "vi" else "en"
        prefs(context).edit().putString("policy_language", normalized).apply()
    }

    fun isStrictFrictionMode(context: Context): Boolean =
        prefs(context).getBoolean("strict_friction_mode", false)

    fun setStrictFrictionMode(context: Context, enabled: Boolean) {
        prefs(context).edit().putBoolean("strict_friction_mode", enabled).apply()
    }

    fun getActiveFocusSessionId(context: Context): String? =
        prefs(context).getString("active_focus_session_id", null)?.takeIf { it.isNotBlank() }

    fun setActiveFocusSessionId(context: Context, sessionId: String?) {
        prefs(context).edit().putString("active_focus_session_id", sessionId).apply()
    }

    fun getActiveFocusEndsAt(context: Context): Long =
        prefs(context).getLong("active_focus_ends_at", 0L)

    fun setActiveFocusEndsAt(context: Context, endsAtMs: Long) {
        prefs(context).edit().putLong("active_focus_ends_at", endsAtMs).apply()
    }

    fun getActiveFocusTitle(context: Context): String? =
        prefs(context).getString("active_focus_title", null)?.takeIf { it.isNotBlank() }

    fun setActiveFocusTitle(context: Context, title: String?) {
        prefs(context).edit().putString("active_focus_title", title).apply()
    }

    fun getAppThemePreset(context: Context): String =
        prefs(context).getString("app_theme_preset", "auto") ?: "auto"

    fun setAppThemePreset(context: Context, preset: String) {
        val normalized = when (preset) {
            "crimson", "espresso", "matcha", "nordic" -> preset
            else -> "auto"
        }
        prefs(context).edit().putString("app_theme_preset", normalized).apply()
    }

    fun getWidgetTasksPreview(context: Context): String =
        prefs(context).getString("widget_tasks_preview", "") ?: ""

    fun setWidgetTasksPreview(context: Context, text: String) {
        prefs(context).edit().putString("widget_tasks_preview", text).apply()
    }

    fun getQuickScratchpad(context: Context): String =
        prefs(context).getString("quick_scratchpad", "") ?: ""

    fun setQuickScratchpad(context: Context, text: String) {
        prefs(context).edit().putString("quick_scratchpad", text).apply()
    }

    fun getDailyReflection(context: Context): String =
        prefs(context).getString("daily_reflection", "") ?: ""

    fun setDailyReflection(context: Context, text: String) {
        prefs(context).edit().putString("daily_reflection", text).apply()
    }
}
