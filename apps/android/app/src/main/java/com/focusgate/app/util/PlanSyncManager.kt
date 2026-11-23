package com.focusgate.app.util

import android.content.Context
import android.os.Build
import com.focusgate.app.BuildConfig
import com.focusgate.app.data.FocusGateDatabase
import com.focusgate.app.policy.RemoteAgentSyncClient
import com.focusgate.app.policy.RemotePlanSnapshot
import com.focusgate.app.policy.UnauthorizedApiException
import com.focusgate.app.ui.FocusGateWidgetProvider
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking

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
            val remotePolicy = runCatching {
                client.pullPolicy(AgentPreferences.DEFAULT_API_BASE_URL, token, deviceId)
            }.getOrNull()
            val policyUnlocked = remotePolicy?.lockActive == false
            if (remotePolicy != null) {
                AgentPreferences.setEarnedMinutesBalance(context, remotePolicy.earnedMinutesBalance)
                AgentPreferences.setWhitelistFocusMode(context, remotePolicy.whitelistFocusMode)
                AgentPreferences.setActiveFocusRunning(context, remotePolicy.activeFocusRunning)
                AgentPreferences.setBedtimeWindow(context, remotePolicy.bedtimeStart, remotePolicy.bedtimeEnd)
            }
            val unlocked = planSnapshot.unlocked || policyUnlocked
            AgentPreferences.setPlanUnlocked(context, unlocked)
            AgentPreferences.setLastSyncAt(context, System.currentTimeMillis())
            updateWidgetState(context, planSnapshot, unlocked)
            runCatching { pushPendingUsage(context, token, deviceId) }
            runCatching { pushLocalRules(context, token, deviceId) }
            runCatching { pushHealthMetricsIfPermitted(context, token, deviceId) }
            planSnapshot.copy(unlocked = unlocked)
        }
    }

    fun syncHealthNow(context: Context): String {
        return withValidToken(context) { token ->
            val deviceId = ensureRegisteredDevice(context, token)
            if (!HealthConnectSync.isAvailable(context)) {
                return@withValidToken "Health Connect unavailable on this device"
            }
            val hasPerm = runBlocking { HealthConnectSync.hasAnyPermission(context) }
            if (!hasPerm) {
                return@withValidToken "Health Connect permission not granted"
            }
            val metrics = runBlocking { HealthConnectSync.readLast7Days(context) }
            if (metrics.isEmpty()) {
                return@withValidToken "Connected, but Health Connect has 0 records from Mi Fitness yet"
            }
            client.pushHealthMetrics(
                apiBaseUrl = AgentPreferences.DEFAULT_API_BASE_URL,
                accessToken = token,
                deviceId = deviceId,
                metrics = metrics,
            )
            "Synced ${metrics.size} day(s) (${metrics.first().steps} steps today)"
        }
    }

    private fun pushHealthMetricsIfPermitted(context: Context, token: String, deviceId: String) {
        val metrics = runBlocking { HealthConnectSync.readLast7Days(context) }
        if (metrics.isNotEmpty()) {
            client.pushHealthMetrics(
                apiBaseUrl = AgentPreferences.DEFAULT_API_BASE_URL,
                accessToken = token,
                deviceId = deviceId,
                metrics = metrics,
            )
        }
    }

    fun activateUnlockPassAndSync(context: Context, minutes: Int = 10): RemotePlanSnapshot {
        return withValidToken(context) { token ->
            val remaining = client.activateUnlockPass(AgentPreferences.DEFAULT_API_BASE_URL, token, minutes)
            AgentPreferences.setEarnedMinutesBalance(context, remaining)
            syncNow(context)
        }
    }

    private fun updateWidgetState(
        context: Context,
        snapshot: RemotePlanSnapshot,
        unlocked: Boolean,
    ) {
        val plan = snapshot.plan
        val summary = when {
            plan == null || plan.allTasksTotal == 0 -> "No tasks in today's plan"
            unlocked -> "Unlocked (${plan.allTasksCompleted}/${plan.allTasksTotal} done)"
            else -> "Locked (${plan.allTasksCompleted}/${plan.allTasksTotal} tasks done)"
        }
        AgentPreferences.setPlanSummaryText(context, summary)
        FocusGateWidgetProvider.updateAll(context)
    }

    private fun pushLocalRules(context: Context, token: String, deviceId: String) {
        val rows = runBlocking { FocusGateDatabase.get(context).blockedAppDao().observeAll().first() }
        val rules = rows
            .filter { it.enabled && !it.isExempt }
            .map { it.packageName to it.label }
        client.pushBlockRules(
            apiBaseUrl = AgentPreferences.DEFAULT_API_BASE_URL,
            accessToken = token,
            deviceId = deviceId,
            rules = rules,
        )
    }

    private fun pushPendingUsage(context: Context, token: String, deviceId: String) {
        val dao = FocusGateDatabase.get(context).usageEventDao()
        val lastId = AgentPreferences.getLastSyncedUsageId(context)
        val pending = runBlocking { dao.unsynced(lastId, 50) }
        if (pending.isEmpty()) return

        val pm = context.packageManager
        client.pushUsageBatch(
            apiBaseUrl = AgentPreferences.DEFAULT_API_BASE_URL,
            accessToken = token,
            deviceId = deviceId,
            events = pending,
            labelLookup = { pkg ->
                runCatching {
                    val info = pm.getApplicationInfo(pkg, 0)
                    pm.getApplicationLabel(info).toString()
                }.getOrNull()
            },
        )
        AgentPreferences.setLastSyncedUsageId(context, pending.maxOf { it.id })
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
            updateWidgetState(context, snapshot, snapshot.unlocked)
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
