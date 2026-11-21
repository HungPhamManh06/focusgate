package com.focusgate.app.service

import android.app.KeyguardManager
import android.app.Service
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import com.focusgate.app.admin.ManagedDeviceController
import com.focusgate.app.data.BlockedApp
import com.focusgate.app.data.FocusGateDatabase
import com.focusgate.app.data.UsageEvent
import com.focusgate.app.policy.PolicyEvaluator
import com.focusgate.app.ui.MainActivity
import com.focusgate.app.util.AgentPreferences
import com.focusgate.app.util.EmergencyAccess
import com.focusgate.app.util.NotificationIds
import com.focusgate.app.util.Notifications
import com.focusgate.app.util.PermissionChecks
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

    override fun onDestroy() {
        isRunning = false
        hideOverlayNow()
        scope.cancel()
        started = false
        super.onDestroy()
    }

    private fun applyRules(rules: List<BlockedApp>) {
        blockedPackages = rules
            .filter { it.enabled && !it.isExempt }
            .map { it.packageName }
            .toSet()
        exemptPackages = rules
            .filter { it.enabled && it.isExempt }
            .map { it.packageName }
            .toSet()
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

        Notifications.updateMonitorNotification(this, usageGranted, overlayGranted, emergencyActive)
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

        val current = foregroundPackage
        if (current == null || current == packageName || emergencyActive) {
            hideOverlay()
            lastShownBlockFor = null
            return
        }

        refreshDeviceEssential(now)
        val isBlocked = PolicyEvaluator.isBlocked(
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
        if (lastShownBlockFor == current && isOverlayVisible) return
        showBlockScreen(current)
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
        EmergencyAccess.start(this, EmergencyAccess.DEFAULT_MINUTES)

        if (AgentPreferences.isManagedEnforcementEnabled(this)) {
            val controller = ManagedDeviceController(this)
            if (controller.isDeviceOwner()) controller.clearSuspensions()
        }

        hideOverlayNow()
        lastShownBlockFor = null
        Notifications.updateMonitorNotification(this, true, true, true)
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
        private const val POLL_INTERVAL_MS = 1_000L
        private const val INITIAL_LOOKBACK_MS = 10_000L
        private const val FAILURE_NOTIFY_INTERVAL_MS = 30_000L
        private const val ESSENTIAL_REFRESH_MS = 60_000L
        private const val SUPPRESS_AFTER_EXIT_MS = 2_000L

        @Volatile
        var isRunning: Boolean = false
            private set

        @Volatile
        var isOverlayVisible: Boolean = false
            private set
    }
}
