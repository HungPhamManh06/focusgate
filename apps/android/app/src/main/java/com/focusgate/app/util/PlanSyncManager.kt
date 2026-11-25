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
                AgentPreferences.setLanguage(context, remotePolicy.language)
            }
            val unlocked = planSnapshot.unlocked || policyUnlocked
            AgentPreferences.setPlanUnlocked(context, unlocked)
            AgentPreferences.setLastSyncAt(context, System.currentTimeMillis())
            updateWidgetState(context, planSnapshot, unlocked)
            runCatching { pushPendingUsage(context, token, deviceId) }
            runCatching { pushLocalRules(context, token, deviceId) }
            planSnapshot.copy(unlocked = unlocked)
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
        val isVi = AgentPreferences.getLanguage(context) == "vi"
        val plan = snapshot.plan
        val summary = when {
            plan == null || plan.allTasksTotal == 0 ->
                if (isVi) "Chưa có nhiệm vụ trong kế hoạch hôm nay" else "No tasks in today's plan"
            unlocked ->
                if (isVi) "Đã mở khóa (${plan.allTasksCompleted}/${plan.allTasksTotal} xong)"
                else "Unlocked (${plan.allTasksCompleted}/${plan.allTasksTotal} done)"
            else ->
                if (isVi) "Đang khóa (${plan.allTasksCompleted}/${plan.allTasksTotal} xong)"
                else "Locked (${plan.allTasksCompleted}/${plan.allTasksTotal} tasks done)"
        }
        AgentPreferences.setPlanSummaryText(context, summary)
        FocusGateWidgetProvider.updateAll(context)
    }

    fun buildTodayPlanAndSync(context: Context): RemotePlanSnapshot {
        return withValidToken(context) { token ->
            val snap = client.buildTodayPlan(AgentPreferences.DEFAULT_API_BASE_URL, token)
            AgentPreferences.setPlanUnlocked(context, snap.unlocked)
            AgentPreferences.setLastSyncAt(context, System.currentTimeMillis())
            updateWidgetState(context, snap, snap.unlocked)
            snap
        }
    }

    fun createTaskAndSync(
        context: Context,
        title: String,
        kind: String,
        requiredFocusMinutes: Int,
        addToTodayPlan: Boolean,
    ): RemotePlanSnapshot {
        return withValidToken(context) { token ->
            val snap = client.createTaskAndOptionallyPlan(
                apiBaseUrl = AgentPreferences.DEFAULT_API_BASE_URL,
                accessToken = token,
                title = title,
                kind = kind,
                requiredFocusMinutes = requiredFocusMinutes,
                addToTodayPlan = addToTodayPlan,
            )
            AgentPreferences.setPlanUnlocked(context, snap.unlocked)
            AgentPreferences.setLastSyncAt(context, System.currentTimeMillis())
            updateWidgetState(context, snap, snap.unlocked)
            snap
        }
    }

    fun confirmAndActivatePlanAndSync(context: Context): RemotePlanSnapshot {
        return withValidToken(context) { token ->
            val deviceId = ensureRegisteredDevice(context, token)
            val (snap, _) = client.runPlanLifecycle(
                apiBaseUrl = AgentPreferences.DEFAULT_API_BASE_URL,
                accessToken = token,
                action = "confirm_and_activate",
                deviceId = deviceId,
            )
            AgentPreferences.setPlanUnlocked(context, snap.unlocked)
            AgentPreferences.setLastSyncAt(context, System.currentTimeMillis())
            updateWidgetState(context, snap, snap.unlocked)
            snap
        }
    }

    fun completePlanAndClaimAndSync(context: Context): Pair<RemotePlanSnapshot, Int> {
        return withValidToken(context) { token ->
            val deviceId = ensureRegisteredDevice(context, token)
            val (snap, granted) = client.runPlanLifecycle(
                apiBaseUrl = AgentPreferences.DEFAULT_API_BASE_URL,
                accessToken = token,
                action = "complete_and_claim",
                deviceId = deviceId,
            )
            AgentPreferences.setPlanUnlocked(context, snap.unlocked)
            AgentPreferences.setLastSyncAt(context, System.currentTimeMillis())
            updateWidgetState(context, snap, snap.unlocked)
            snap to granted
        }
    }

    fun saveHealthMetricAndSync(
        context: Context,
        steps: Int,
        activeCalories: Int,
        sleepMinutes: Int,
        weightKg: Double?,
    ) {
        withValidToken(context) { token ->
            val deviceId = ensureRegisteredDevice(context, token)
            val today = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(java.util.Date())
            client.pushDailyHealthMetric(
                apiBaseUrl = AgentPreferences.DEFAULT_API_BASE_URL,
                accessToken = token,
                deviceId = deviceId,
                date = today,
                steps = steps,
                activeCalories = activeCalories,
                sleepMinutes = sleepMinutes,
                weightKg = weightKg,
            )
        }
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

    fun syncRemoteFocusSession(context: Context): Boolean {
        return runCatching {
            withValidToken(context) { token ->
                val url = java.net.URL("${AgentPreferences.DEFAULT_API_BASE_URL}/api/agent/focus-session")
                val conn = (url.openConnection() as java.net.HttpURLConnection).apply {
                    requestMethod = "GET"
                    connectTimeout = 8_000
                    readTimeout = 8_000
                    setRequestProperty("Authorization", "Bearer $token")
                }
                try {
                    if (conn.responseCode !in 200..299) return@withValidToken false
                    val body = conn.inputStream.bufferedReader().use { it.readText() }
                    val json = org.json.JSONObject(body)
                    val active = json.optBoolean("active", false)
                    val session = json.optJSONObject("session")
                    if (active && session != null) {
                        val id = session.optString("id", "")
                        val title = session.optString("taskTitle", "").ifBlank { "Focus Sprint" }
                        val remainingSec = session.optLong("remainingSeconds", 0L)
                        val status = session.optString("status", "running")
                        val endsAt = System.currentTimeMillis() + remainingSec * 1000L
                        AgentPreferences.setActiveFocusRunning(context, status == "running")
                        AgentPreferences.setActiveFocusSessionId(context, id)
                        AgentPreferences.setActiveFocusTitle(context, title)
                        AgentPreferences.setActiveFocusEndsAt(context, endsAt)
                        Notifications.showLiveFocusNotification(
                            context = context,
                            taskTitle = title,
                            endsAtEpochMs = endsAt,
                            isPaused = status == "paused",
                        )
                        true
                    } else {
                        AgentPreferences.setActiveFocusRunning(context, false)
                        AgentPreferences.setActiveFocusSessionId(context, null)
                        AgentPreferences.setActiveFocusEndsAt(context, 0L)
                        Notifications.cancelLiveFocusNotification(context)
                        false
                    }
                } finally {
                    conn.disconnect()
                }
            }
        }.getOrDefault(false)
    }

    fun startRemoteFocusSession(context: Context, plannedMinutes: Int = 25) {
        withValidToken(context) { token ->
            val url = java.net.URL("${AgentPreferences.DEFAULT_API_BASE_URL}/api/agent/focus-session")
            val conn = (url.openConnection() as java.net.HttpURLConnection).apply {
                requestMethod = "POST"
                doOutput = true
                connectTimeout = 8_000
                readTimeout = 8_000
                setRequestProperty("Authorization", "Bearer $token")
                setRequestProperty("Content-Type", "application/json")
            }
            try {
                val payload = org.json.JSONObject()
                    .put("action", "start")
                    .put("plannedMinutes", plannedMinutes)
                    .put("mode", "pomodoro_25_5")
                    .toString()
                conn.outputStream.use { it.write(payload.toByteArray(Charsets.UTF_8)) }
                if (conn.responseCode in 200..299) {
                    val body = conn.inputStream.bufferedReader().use { it.readText() }
                    val session = org.json.JSONObject(body).optJSONObject("session")
                    if (session != null) {
                        AgentPreferences.setActiveFocusSessionId(context, session.optString("id", ""))
                    }
                }
            } finally {
                conn.disconnect()
            }
        }
    }

    fun updateRemoteFocusSession(context: Context, action: String, sessionId: String) {
        withValidToken(context) { token ->
            val url = java.net.URL("${AgentPreferences.DEFAULT_API_BASE_URL}/api/agent/focus-session")
            val conn = (url.openConnection() as java.net.HttpURLConnection).apply {
                requestMethod = "POST"
                doOutput = true
                connectTimeout = 8_000
                readTimeout = 8_000
                setRequestProperty("Authorization", "Bearer $token")
                setRequestProperty("Content-Type", "application/json")
            }
            try {
                val payload = org.json.JSONObject()
                    .put("action", action)
                    .put("sessionId", sessionId)
                    .toString()
                conn.outputStream.use { it.write(payload.toByteArray(Charsets.UTF_8)) }
                conn.responseCode
            } finally {
                conn.disconnect()
            }
        }
    }
}
