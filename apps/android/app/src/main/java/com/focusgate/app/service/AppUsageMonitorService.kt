package com.focusgate.app.service

import android.app.AlarmManager
import android.app.KeyguardManager
import android.app.PendingIntent
import android.app.Service
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.os.SystemClock
import android.util.Log
import com.focusgate.app.FocusGateApp
import com.focusgate.app.admin.EmergencyPresentationState
import com.focusgate.app.admin.EmergencyStatusEvaluator
import com.focusgate.app.admin.EmergencyStatusPresentation
import com.focusgate.app.data.BlockedApp
import com.focusgate.app.data.FocusGateDatabase
import com.focusgate.app.data.UsageEvent
import com.focusgate.app.policy.PolicyEvaluator
import com.focusgate.app.ui.LockActivity
import com.focusgate.app.ui.MainActivity
import com.focusgate.app.util.AgentPreferences
import com.focusgate.app.util.EmergencyAccess
import com.focusgate.app.util.NotificationIds
import com.focusgate.app.util.Notifications
import com.focusgate.app.util.PermissionChecks
import com.focusgate.app.util.ProtectionWatchdog
import com.focusgate.app.util.SystemPackages
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Foreground monitor for Personal Strict Mode.
 *
 * UsageStatsManager only reports foreground events; it does not enforce.
 * Enforcement is a user-granted full-screen overlay, which avoids background
 * activity launches. No AccessibilityService is used.
 */
class AppUsageMonitorService : Service() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private lateinit var overlayController: BlockOverlayController

    @Volatile
    private var blockedPackages: Set<String> = emptySet()

    @Volatile
    private var exemptPackages: Set<String> = emptySet()

    private var lastEventTimestamp = 0L
    private var foregroundPackage: String? = null
    private var openUsageEventId: Long? = null
    private var lastShownBlockFor: String? = null
    private var lastBlockFailureAt = 0L
    private var lastUsageGranted = true
    private var lastOverlayGranted = true
    private var wasUsable = true
    private var started = false

    @Volatile
    private var deviceEssential: Set<String> = emptySet()
    private var deviceEssentialRefreshedAt = 0L

    // After "Back home"/"Open FocusGate" the next foreground event may arrive
    // a moment later than the next poll. Suppress the overlay for that package
    // briefly so it does not flash over the launcher; the window is bounded so
    // a missing event can never leave a restricted app usable.
    @Volatile
    private var suppressedPackage: String? = null
    @Volatile
    private var suppressedUntil = 0L

    @Volatile
    private var lastEmergencyPresentation: EmergencyStatusPresentation? = null

    override fun onCreate() {
        super.onCreate()
        overlayController = BlockOverlayController(this)
        isRunning = true
        deviceEssential = SystemPackages.deviceEssential(this)
        lastUsageGranted = PermissionChecks.hasUsageAccess(this)
        lastOverlayGranted = PermissionChecks.hasOverlayAccess(this)

        startForeground(
            NotificationIds.MONITOR_NOTIFICATION,
            Notifications.monitorNotification(
                this,
                lastUsageGranted,
                lastOverlayGranted,
                EmergencyAccess.isActive(this),
            ),
        )

        scope.launch {
            FocusGateDatabase.get(this@AppUsageMonitorService)
                .blockedAppDao()
                .observeAll()
                .catch { Log.w(TAG, "Could not observe app policy", it) }
                .collect { rules -> applyRules(rules) }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (!started) {
            started = true
            scope.launch { monitorLoop() }
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onTaskRemoved(rootIntent: Intent?) {
        scheduleRestartIfNeeded()
        super.onTaskRemoved(rootIntent)
    }

    override fun onDestroy() {
        isRunning = false
        appliedBlockedPackages = emptySet()
        appliedExemptPackages = emptySet()
        hideOverlayNow()
        scope.cancel()
        started = false
        scheduleRestartIfNeeded()
        super.onDestroy()
    }

    private fun scheduleRestartIfNeeded() {
        if (!AgentPreferences.isMonitorEnabled(this) ||
            AgentPreferences.isManagedEnforcementEnabled(this)
        ) {
            return
        }
        val serviceIntent = Intent(applicationContext, AppUsageMonitorService::class.java)
        val pendingIntent = PendingIntent.getForegroundService(
            applicationContext,
            RESTART_REQUEST_CODE,
            serviceIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val alarmManager = getSystemService(AlarmManager::class.java)
        alarmManager?.set(
            AlarmManager.ELAPSED_REALTIME,
            SystemClock.elapsedRealtime() + RESTART_DELAY_MS,
            pendingIntent,
        )
        ProtectionWatchdog.enqueueImmediateCheck(applicationContext)
    }

    private fun applyRules(rules: List<BlockedApp>) {
        val nextBlocked = rules
            .filter { it.enabled && !it.isExempt }
            .map { it.packageName }
            .toSet()
        val nextExempt = rules
            .filter { it.enabled && it.isExempt }
            .map { it.packageName }
            .toSet()
        blockedPackages = nextBlocked
        exemptPackages = nextExempt
        appliedBlockedPackages = nextBlocked
        appliedExemptPackages = nextExempt
        deviceEssential = SystemPackages.deviceEssential(this)
        deviceEssentialRefreshedAt = System.currentTimeMillis()
    }

    private suspend fun monitorLoop() {
        while (scope.isActive) {
            try {
                pollUsage()
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (throwable: Throwable) {
                Log.w(TAG, "Usage poll failed", throwable)
            }
            delay(POLL_INTERVAL_MS)
        }
    }

    private suspend fun pollUsage() {
        val now = System.currentTimeMillis()
        val usageGranted = PermissionChecks.hasUsageAccess(this)
        val overlayGranted = PermissionChecks.hasOverlayAccess(this)
        val emergencyActive = EmergencyAccess.isActive(this)
        if (!emergencyActive) {
            lastEmergencyPresentation = null
        }

        Notifications.updateMonitorNotification(
            context = this,
            usageGranted = usageGranted,
            overlayGranted = overlayGranted,
            emergencyActive = emergencyActive,
            emergencyPresentation = lastEmergencyPresentation,
        )
        reportPermissionTransitions(usageGranted, overlayGranted)

        if (!usageGranted || !overlayGranted) {
            hideOverlay()
            closeOpenEvent(now)
            foregroundPackage = null
            lastEventTimestamp = now
            lastShownBlockFor = null
            wasUsable = false
            return
        }

        val powerManager = getSystemService(PowerManager::class.java)
        val keyguardManager = getSystemService(KeyguardManager::class.java)
        val usable = (powerManager?.isInteractive ?: true) &&
            (keyguardManager?.isKeyguardLocked != true)

        if (!usable) {
            hideOverlay()
            closeOpenEvent(now)
            foregroundPackage = null
            lastEventTimestamp = now
            lastShownBlockFor = null
            wasUsable = false
            return
        }

        val manager = getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager ?: return
        if (lastEventTimestamp == 0L) lastEventTimestamp = now - INITIAL_LOOKBACK_MS

        if (!wasUsable) {
            resyncForeground(manager, now)
        }
        wasUsable = true

        val events = manager.queryEvents(lastEventTimestamp, now) ?: return
        val event = UsageEvents.Event()
        var newestTimestamp = lastEventTimestamp

        while (events.hasNextEvent()) {
            events.getNextEvent(event)
            if (event.timeStamp <= lastEventTimestamp) continue

            when {
                isForegroundEvent(event.eventType) ->
                    onForeground(event.packageName, event.timeStamp)

                isBackgroundEvent(event.eventType) ->
                    if (event.packageName == foregroundPackage) closeOpenEvent(event.timeStamp)
            }
            newestTimestamp = maxOf(newestTimestamp, event.timeStamp)
        }
        lastEventTimestamp = newestTimestamp

        refreshDeviceEssential(now)
        val current = resolveCurrentForeground(manager, now)
        if (current != null && current != foregroundPackage) {
            foregroundPackage = current
        }

        if (current == null || current == packageName || emergencyActive) {
            hideOverlay()
            lastShownBlockFor = null
            return
        }

        val unlockedByPlan = AgentPreferences.isPlanUnlocked(this)
        val isBlocked = !unlockedByPlan && PolicyEvaluator.isBlocked(
            packageName = current,
            blockedPackages = blockedPackages,
            exemptPackages = exemptPackages,
            emergencyActive = emergencyActive,
            ownPackage = packageName,
            deviceEssential = deviceEssential,
        )

        if (!isBlocked) {
            hideOverlay()
            lastShownBlockFor = null
            return
        }

        if (current == suppressedPackage && now < suppressedUntil) return
        if (lastShownBlockFor == current && isOverlayVisible && overlayController.isShowingFor(current)) {
            return
        }
        showBlockScreen(current)
    }

    private fun resolveCurrentForeground(manager: UsageStatsManager, now: Long): String? {
        val events = manager.queryEvents(now - FOREGROUND_LOOKBACK_MS, now) ?: return null
        val event = UsageEvents.Event()
        var latestActive: String? = null
        var lastPausedPkg: String? = null
        var lastPausedAt = 0L
        var lastNonEssentialPkg: String? = null
        var lastNonEssentialAt = 0L

        while (events.hasNextEvent()) {
            events.getNextEvent(event)
            val pkg = event.packageName ?: continue
            when {
                isForegroundEvent(event.eventType) -> {
                    latestActive = pkg
                    if (pkg != packageName && !PolicyEvaluator.isEssential(pkg, deviceEssential)) {
                        lastNonEssentialPkg = pkg
                        lastNonEssentialAt = event.timeStamp
                    }
                }
                isBackgroundEvent(event.eventType) -> {
                    if (pkg == latestActive) {
                        latestActive = null
                    }
                    lastPausedPkg = pkg
                    lastPausedAt = event.timeStamp
                }
            }
        }

        if (latestActive != null) return latestActive

        // On MIUI/HyperOS, dragging into Recents and dropping back into an app can:
        // 1) emit ACTIVITY_PAUSED for the app without re-emitting ACTIVITY_RESUMED, OR
        // 2) emit ACTIVITY_RESUMED then ACTIVITY_PAUSED for the launcher (Recents) when
        //    the gesture is cancelled back into the underlying app.
        val candidate = when {
            lastPausedPkg != null &&
                lastPausedPkg != packageName &&
                !PolicyEvaluator.isEssential(lastPausedPkg, deviceEssential) &&
                now - lastPausedAt < FOREGROUND_LOOKBACK_MS -> lastPausedPkg
            lastPausedPkg != null &&
                PolicyEvaluator.isEssential(lastPausedPkg, deviceEssential) &&
                lastNonEssentialPkg != null &&
                now - lastNonEssentialAt < FOREGROUND_LOOKBACK_MS -> lastNonEssentialPkg
            else -> null
        }

        if (candidate != null) {
            val stats = manager.queryUsageStats(
                UsageStatsManager.INTERVAL_BEST,
                lastPausedAt,
                now,
            )
            val essentialUsedAfter = stats?.any { stat ->
                stat.lastTimeUsed > lastPausedAt + 300L &&
                    (stat.packageName == packageName ||
                        PolicyEvaluator.isEssential(stat.packageName, deviceEssential))
            } == true
            if (!essentialUsedAfter) {
                return candidate
            }
        }
        return foregroundPackage
    }

    private fun refreshDeviceEssential(now: Long) {
        if (now - deviceEssentialRefreshedAt < ESSENTIAL_REFRESH_MS && deviceEssentialRefreshedAt != 0L) return
        deviceEssentialRefreshedAt = now
        deviceEssential = SystemPackages.deviceEssential(this)
    }

    private fun reportPermissionTransitions(usageGranted: Boolean, overlayGranted: Boolean) {
        if (lastUsageGranted && !usageGranted) {
            Notifications.notifyProtectionLost(
                this,
                "Usage Access was revoked. Protection is off until it is granted again.",
            )
        }
        if (lastOverlayGranted && !overlayGranted) {
            Notifications.notifyProtectionLost(
                this,
                "Display over other apps was revoked. The block screen cannot appear.",
            )
        }
        lastUsageGranted = usageGranted
        lastOverlayGranted = overlayGranted
    }

    private fun resyncForeground(manager: UsageStatsManager, now: Long) {
        deviceEssential = SystemPackages.deviceEssential(this)
        deviceEssentialRefreshedAt = now
        val events = manager.queryEvents(now - INITIAL_LOOKBACK_MS, now) ?: return
        val event = UsageEvents.Event()
        var latest: String? = null

        while (events.hasNextEvent()) {
            events.getNextEvent(event)
            when {
                isForegroundEvent(event.eventType) -> latest = event.packageName
                isBackgroundEvent(event.eventType) && event.packageName == latest -> latest = null
            }
        }

        foregroundPackage = latest
        openUsageEventId = null
        lastEventTimestamp = now
    }

    private suspend fun onForeground(packageName: String, timestamp: Long) {
        if (packageName == foregroundPackage) return

        closeOpenEvent(timestamp)
        foregroundPackage = packageName
        lastShownBlockFor = null
        if (packageName != suppressedPackage) suppressedPackage = null

        if (packageName == this.packageName) return

        val blocked = PolicyEvaluator.isBlocked(
            packageName = packageName,
            blockedPackages = blockedPackages,
            exemptPackages = exemptPackages,
            emergencyActive = EmergencyAccess.isActive(this),
            ownPackage = this.packageName,
            deviceEssential = deviceEssential,
        )
        openUsageEventId = FocusGateDatabase.get(this).usageEventDao().insert(
            UsageEvent(packageName = packageName, startedAt = timestamp, blocked = blocked),
        )
    }

    private suspend fun closeOpenEvent(timestamp: Long) {
        val id = openUsageEventId ?: return
        FocusGateDatabase.get(this).usageEventDao().close(id, timestamp)
        openUsageEventId = null
    }

    private suspend fun showBlockScreen(packageName: String) {
        val appLabel = runCatching {
            val info = packageManager.getApplicationInfo(packageName, 0)
            packageManager.getApplicationLabel(info).toString()
        }.getOrDefault(packageName)

        val shown = withContext(Dispatchers.Main.immediate) {
            overlayController.show(
                packageName = packageName,
                appLabel = appLabel,
                onBackHome = ::goHome,
                onOpenFocusGate = ::openFocusGate,
                onEmergency = ::startEmergencyFromOverlay,
            )
        }
        isOverlayVisible = shown

        if (shown) {
            lastShownBlockFor = packageName
            runCatching { startActivity(LockActivity.createIntent(this, appLabel)) }
        } else {
            lastShownBlockFor = null
            val now = System.currentTimeMillis()
            if (now - lastBlockFailureAt >= FAILURE_NOTIFY_INTERVAL_MS) {
                lastBlockFailureAt = now
                Notifications.notifyBlockScreenFailed(this, packageName)
            }
        }
    }

    private suspend fun hideOverlay() {
        withContext(Dispatchers.Main.immediate) { hideOverlayNow() }
    }

    private fun hideOverlayNow() {
        overlayController.hide()
        isOverlayVisible = false
    }

    private fun suppressBriefly() {
        suppressedPackage = foregroundPackage
        suppressedUntil = System.currentTimeMillis() + SUPPRESS_AFTER_EXIT_MS
    }

    private fun goHome() {
        suppressBriefly()
        hideOverlayNow()
        lastShownBlockFor = null
        val intent = Intent(Intent.ACTION_MAIN)
            .addCategory(Intent.CATEGORY_HOME)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        runCatching { startActivity(intent) }
    }

    private fun openFocusGate() {
        suppressBriefly()
        hideOverlayNow()
        lastShownBlockFor = null
        val intent = Intent(this, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }
        runCatching { startActivity(intent) }
    }

    private fun startEmergencyFromOverlay() {
        hideOverlayNow()
        lastShownBlockFor = null
        scope.launch {
            val presentation = try {
                val outcome = withContext(Dispatchers.IO) {
                    FocusGateApp.coordinator(this@AppUsageMonitorService)
                        .startEmergency(EmergencyAccess.DEFAULT_MINUTES)
                }
                EmergencyStatusEvaluator.evaluate(outcome)
            } catch (throwable: Throwable) {
                Log.w(TAG, "Emergency start failed", throwable)
                EmergencyStatusEvaluator.failed(throwable.message)
            }

            lastEmergencyPresentation = presentation
            val usageGranted = PermissionChecks.hasUsageAccess(this@AppUsageMonitorService)
            val overlayGranted = PermissionChecks.hasOverlayAccess(this@AppUsageMonitorService)
            val isEmergencyActive = presentation.state == EmergencyPresentationState.EMERGENCY_ACTIVE ||
                presentation.state == EmergencyPresentationState.EMERGENCY_ACTIVE_DEGRADED

            Notifications.updateMonitorNotification(
                context = this@AppUsageMonitorService,
                usageGranted = usageGranted,
                overlayGranted = overlayGranted,
                emergencyActive = isEmergencyActive,
                emergencyPresentation = presentation,
            )
            if (presentation.state == EmergencyPresentationState.EMERGENCY_ACTIVE_DEGRADED ||
                presentation.state == EmergencyPresentationState.EMERGENCY_FAILED
            ) {
                Notifications.notifyEmergencyIssue(this@AppUsageMonitorService, presentation)
            }
        }
    }

    private fun isForegroundEvent(type: Int): Boolean =
        type == UsageEvents.Event.MOVE_TO_FOREGROUND ||
            (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
                type == UsageEvents.Event.ACTIVITY_RESUMED)

    private fun isBackgroundEvent(type: Int): Boolean =
        type == UsageEvents.Event.MOVE_TO_BACKGROUND ||
            (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
                type == UsageEvents.Event.ACTIVITY_PAUSED)

    companion object {
        private const val TAG = "FocusGateMonitor"
        private const val POLL_INTERVAL_MS = 350L
        private const val RESTART_DELAY_MS = 600L
        private const val RESTART_REQUEST_CODE = 1001
        private const val INITIAL_LOOKBACK_MS = 10_000L
        private const val FOREGROUND_LOOKBACK_MS = 20_000L
        private const val FAILURE_NOTIFY_INTERVAL_MS = 30_000L
        private const val ESSENTIAL_REFRESH_MS = 60_000L
        private const val SUPPRESS_AFTER_EXIT_MS = 2_000L

        @Volatile
        var isRunning: Boolean = false
            private set

        @Volatile
        var isOverlayVisible: Boolean = false
            private set

        @Volatile
        var appliedBlockedPackages: Set<String> = emptySet()
            private set

        @Volatile
        var appliedExemptPackages: Set<String> = emptySet()
            private set
    }
}
