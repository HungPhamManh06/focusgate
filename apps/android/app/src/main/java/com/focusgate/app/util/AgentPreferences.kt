package com.focusgate.app.util

import android.content.Context

object AgentPreferences {
    private const val NAME = "focusgate"
    private const val KEY_ONBOARDING_COMPLETE = "onboarding_complete"
    private const val KEY_PRIVACY_CONSENT = "privacy_consent"
    private const val KEY_MONITOR_ENABLED = "monitor_enabled"
    private const val KEY_MANAGED_ENFORCEMENT = "managed_enforcement"

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
}
