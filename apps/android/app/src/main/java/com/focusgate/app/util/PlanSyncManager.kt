package com.focusgate.app.util

import android.content.Context
import android.os.Build
import com.focusgate.app.BuildConfig
import com.focusgate.app.policy.RemoteAgentSyncClient
import com.focusgate.app.policy.RemotePlanSnapshot
import com.focusgate.app.policy.UnauthorizedApiException

object PlanSyncManager {
    private val client = RemoteAgentSyncClient()

    fun signInAndSync(
        context: Context,
        email: String,
        password: String,
    ): RemotePlanSnapshot {
        val session = client.signInWithPassword(
            supabaseUrl = AgentPreferences.DEFAULT_SUPABASE_URL,
            anonKey = AgentPreferences.DEFAULT_SUPABASE_ANON_KEY,
            email = email.trim(),
            password = password,
        )
        AgentPreferences.saveAuthSession(
            context = context,
            accessToken = session.accessToken,
            refreshToken = session.refreshToken,
            email = session.email,
        )
        return syncNow(context)
    }

    fun syncNow(context: Context): RemotePlanSnapshot {
        return withValidToken(context) { token ->
            val deviceId = ensureRegisteredDevice(context, token)
            val planSnapshot = client.fetchTodayPlan(AgentPreferences.DEFAULT_API_BASE_URL, token)
            val policyUnlocked = runCatching {
                !client.pullPolicy(AgentPreferences.DEFAULT_API_BASE_URL, token, deviceId).lockActive
            }.getOrDefault(false)
            val unlocked = planSnapshot.unlocked || policyUnlocked
            AgentPreferences.setPlanUnlocked(context, unlocked)
            AgentPreferences.setLastSyncAt(context, System.currentTimeMillis())
            planSnapshot.copy(unlocked = unlocked)
        }
    }

    fun completeTaskAndSync(
        context: Context,
        planTaskId: String,
    ): RemotePlanSnapshot {
        return withValidToken(context) { token ->
            val deviceId = ensureRegisteredDevice(context, token)
            val snapshot = client.completePlanTask(
                apiBaseUrl = AgentPreferences.DEFAULT_API_BASE_URL,
                accessToken = token,
                planTaskId = planTaskId,
                deviceId = deviceId,
            )
            AgentPreferences.setPlanUnlocked(context, snapshot.unlocked)
            AgentPreferences.setLastSyncAt(context, System.currentTimeMillis())
            snapshot
        }
    }

    private fun ensureRegisteredDevice(context: Context, token: String): String {
        val existing = AgentPreferences.getDeviceId(context)
        if (existing != null) return existing

        val deviceName = "${Build.MANUFACTURER} ${Build.MODEL}".trim().ifBlank { "Android phone" }
        val reg = client.registerDevice(
            apiBaseUrl = AgentPreferences.DEFAULT_API_BASE_URL,
            accessToken = token,
            deviceName = deviceName,
            appVersion = BuildConfig.VERSION_NAME,
        )
        AgentPreferences.setDeviceId(context, reg.deviceId)
        return reg.deviceId
    }

    private fun <T> withValidToken(context: Context, block: (String) -> T): T {
        val token = AgentPreferences.getAccessToken(context)
            ?: throw IllegalStateException("Please sign in first.")
        return try {
            block(token)
        } catch (_: UnauthorizedApiException) {
            val refresh = AgentPreferences.getRefreshToken(context)
                ?: throw IllegalStateException("Session expired. Please sign in again.")
            val email = AgentPreferences.getUserEmail(context) ?: ""
            val refreshed = client.refreshSession(
                supabaseUrl = AgentPreferences.DEFAULT_SUPABASE_URL,
                anonKey = AgentPreferences.DEFAULT_SUPABASE_ANON_KEY,
                refreshToken = refresh,
                fallbackEmail = email,
            )
            AgentPreferences.saveAuthSession(
                context = context,
                accessToken = refreshed.accessToken,
                refreshToken = refreshed.refreshToken,
                email = refreshed.email,
            )
            block(refreshed.accessToken)
        }
    }
}
