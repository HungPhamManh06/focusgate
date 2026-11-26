package com.focusgate.app.ui

import android.content.Intent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.Crossfade
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.focusgate.app.BuildConfig
import com.focusgate.app.FocusGateApp
import com.focusgate.app.R
import com.focusgate.app.admin.EmergencyPresentationState
import com.focusgate.app.admin.EmergencyStatusEvaluator
import com.focusgate.app.admin.ManagedDeviceController
import com.focusgate.app.admin.ManagedPolicyAudit
import com.focusgate.app.admin.PolicyOperationOutcome
import com.focusgate.app.data.FocusGateDatabase
import com.focusgate.app.policy.PolicyEvaluator
import com.focusgate.app.policy.ProtectionEvaluator
import com.focusgate.app.policy.ProtectionLevel
import com.focusgate.app.policy.RemotePlanSnapshot
import com.focusgate.app.service.AppUsageMonitorService
import com.focusgate.app.util.AgentPreferences
import com.focusgate.app.util.AppUpdateInfo
import com.focusgate.app.util.AppUpdater
import com.focusgate.app.util.EmergencyAccess
import com.focusgate.app.util.FocusSoundscapePlayer
import com.focusgate.app.util.Notifications
import com.focusgate.app.util.SoundscapeMode
import com.focusgate.app.util.PermissionChecks
import com.focusgate.app.util.PlanSyncManager
import com.focusgate.app.util.ProtectionWatchdog
import com.focusgate.app.util.SystemPackages
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.math.ceil

private enum class AppTab { RESTRICT, EXEMPT }
private enum class HomeBottomTab { TODAY, WEB, GUARD }

private fun matchesAppCategory(packageName: String, label: String, category: String): Boolean {
    if (category == "all") return true
    val key = "${packageName.lowercase()} ${label.lowercase()}"
    return when (category) {
        "social" -> listOf("facebook", "instagram", "twitter", "threads", "tiktok", "musically", "reddit", "snapchat", "zalo", "messenger", "discord", "telegram").any { key.contains(it) }
        "video" -> listOf("youtube", "netflix", "twitch", "bilibili", "vimeo", "primevideo", "disney", "spotify", "vieon", "fptplay").any { key.contains(it) }
        "game" -> listOf("game", "garena", "pubg", "roblox", "minecraft", "mihoyo", "genshin", "supercell", "riot", "mobile.legends", "arena").any { key.contains(it) }
        else -> true
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    onOpenSetup: () -> Unit,
    openAddTaskOnLaunch: Boolean = false,
    themePreset: String = "auto",
    onThemePresetChange: (String) -> Unit = {},
) {
    val context = LocalContext.current
    val haptic = LocalHapticFeedback.current
    val scope = rememberCoroutineScope()
    val lifecycleOwner = LocalLifecycleOwner.current
    val database = remember { FocusGateDatabase.get(context) }
    val managedController = remember { ManagedDeviceController(context) }
    val coordinator = remember { FocusGateApp.coordinator(context) }

    var apps by remember { mutableStateOf<List<InstalledApp>>(emptyList()) }
    var ruleLabels by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    // Separate persisted/applied policy from unsaved UI edits so protection
    // status never claims Protected for changes that have not been saved.
    var savedBlocked by remember { mutableStateOf<Set<String>>(emptySet()) }
    var savedExempt by remember { mutableStateOf<Set<String>>(emptySet()) }
    var pendingBlocked by remember { mutableStateOf<Set<String>>(emptySet()) }
    var pendingExempt by remember { mutableStateOf<Set<String>>(emptySet()) }
    var search by remember { mutableStateOf("") }
    var tab by remember { mutableStateOf(AppTab.RESTRICT) }
    var appCategory by remember { mutableStateOf("all") }
    var showSanctuaryFullscreen by remember { mutableStateOf(false) }
    var showQuickStatsSheet by remember { mutableStateOf(false) }
    var showSoundscapeSheet by remember { mutableStateOf(false) }
    var showScratchpadSheet by remember { mutableStateOf(false) }
    var showThemePickerSheet by remember { mutableStateOf(false) }
    var dailyFocusGoalMin by remember { mutableIntStateOf(90) }
    var activeSoundMode by remember { mutableStateOf(FocusSoundscapePlayer.getMode()) }
    var lastSyncedAtMs by remember { mutableLongStateOf(System.currentTimeMillis()) }

    var usageGranted by remember { mutableStateOf(PermissionChecks.hasUsageAccess(context)) }
    var overlayGranted by remember { mutableStateOf(PermissionChecks.hasOverlayAccess(context)) }
    var availableUpdate by remember { mutableStateOf<AppUpdateInfo?>(null) }
    var updatingApp by remember { mutableStateOf(false) }
    var strictFrictionMode by remember {
        mutableStateOf(AgentPreferences.isStrictFrictionMode(context))
    }
    var showCompletedTodayTasks by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        availableUpdate = AppUpdater.checkForUpdate()
        if (AgentPreferences.getAccessToken(context) != null) {
            withContext(Dispatchers.IO) {
                PlanSyncManager.syncRemoteFocusSession(context)
            }
        }
    }
    var notificationsGranted by remember {
        mutableStateOf(PermissionChecks.hasNotificationPermission(context))
    }
    var monitorEnabled by remember { mutableStateOf(AgentPreferences.isMonitorEnabled(context)) }
    var managedEnabled by remember {
        mutableStateOf(AgentPreferences.isManagedEnforcementEnabled(context))
    }
    var deviceOwner by remember { mutableStateOf(managedController.isDeviceOwner()) }
    var managedAudit by remember {
        mutableStateOf(ManagedPolicyAudit(deviceOwnerValid = managedController.isDeviceOwner()))
    }
    var deviceEssential by remember { mutableStateOf(SystemPackages.deviceEssential(context)) }
    var serviceRunning by remember { mutableStateOf(AppUsageMonitorService.isRunning) }
    var monitorAppliedBlocked by remember {
        mutableStateOf(AppUsageMonitorService.appliedBlockedPackages)
    }
    var monitorAppliedExempt by remember {
        mutableStateOf(AppUsageMonitorService.appliedExemptPackages)
    }
    var emergencyRemaining by remember { mutableLongStateOf(EmergencyAccess.remainingMillis(context)) }

    var banner by remember { mutableStateOf<String?>(null) }
    var showEmergencyDialog by remember { mutableStateOf(false) }
    var activeOperations by remember { mutableIntStateOf(0) }
    var operationSequence by remember { mutableIntStateOf(0) }
    val isOperationInProgress = activeOperations > 0

    var signedInEmail by remember { mutableStateOf(AgentPreferences.getUserEmail(context)) }
    var emailInput by remember { mutableStateOf(AgentPreferences.getUserEmail(context) ?: "") }
    var language by remember { mutableStateOf(AgentPreferences.getLanguage(context)) }
    val isVi = language == "vi"
    fun tr(en: String, vi: String): String = if (isVi) vi else en
    var healthStepsInput by remember { mutableStateOf("8000") }
    var healthCaloriesInput by remember { mutableStateOf("300") }
    var healthSleepInput by remember { mutableStateOf("7.5") }
    var healthWeightInput by remember { mutableStateOf("") }
    var healthSyncBusy by remember { mutableStateOf(false) }
    var healthSyncMessage by remember { mutableStateOf<String?>(null) }
    var bottomTab by remember { mutableStateOf(HomeBottomTab.TODAY) }
    var showAddTaskDialog by remember { mutableStateOf(openAddTaskOnLaunch && signedInEmail != null) }
    var newTaskTitle by remember { mutableStateOf("") }
    var newTaskKind by remember { mutableStateOf("must_do") }
    var newTaskFocusMinutes by remember { mutableIntStateOf(0) }
    var newTaskAddToToday by remember { mutableStateOf(true) }
    var addTaskBusy by remember { mutableStateOf(false) }
    var passwordInput by remember { mutableStateOf("") }
    var planSnapshot by remember { mutableStateOf<RemotePlanSnapshot?>(null) }
    var planUnlocked by remember { mutableStateOf(AgentPreferences.isPlanUnlocked(context)) }
    var planSyncBusy by remember { mutableStateOf(false) }
    var completingTaskId by remember { mutableStateOf<String?>(null) }
    var syncError by remember { mutableStateOf<String?>(null) }
    var bedtimeEnabled by remember { mutableStateOf(AgentPreferences.isBedtimeEnabled(context)) }
    var strictNoEmergency by remember { mutableStateOf(AgentPreferences.isStrictNoEmergency(context)) }
    var settingsGuardEnabled by remember { mutableStateOf(AgentPreferences.isSettingsGuardEnabled(context)) }
    var soundscapePlaying by remember { mutableStateOf(FocusSoundscapePlayer.isPlaying()) }
    var earnedMinutesBalance by remember { mutableStateOf(AgentPreferences.getEarnedMinutesBalance(context)) }
    var userPullRefreshing by remember { mutableStateOf(false) }
    var backgroundSyncInFlight by remember { mutableStateOf(false) }
    var focusSyncVersion by remember { mutableIntStateOf(0) }

    fun syncPlanFromWeb(silent: Boolean = false, fromPullToRefresh: Boolean = false) {
        if (AgentPreferences.getAccessToken(context) == null) return
        if (silent && (backgroundSyncInFlight || planSyncBusy || userPullRefreshing)) return
        if (!silent && planSyncBusy) return
        backgroundSyncInFlight = true
        if (fromPullToRefresh) userPullRefreshing = true
        else if (!silent) planSyncBusy = true
        if (!silent) syncError = null
        scope.launch {
            try {
                val snapshot = withContext(Dispatchers.IO) {
                    PlanSyncManager.syncRemoteFocusSession(context)
                    PlanSyncManager.syncNow(context)
                }
                planSnapshot = snapshot
                planUnlocked = snapshot.unlocked
                signedInEmail = AgentPreferences.getUserEmail(context)
                earnedMinutesBalance = AgentPreferences.getEarnedMinutesBalance(context)
                lastSyncedAtMs = System.currentTimeMillis()
                focusSyncVersion += 1
                val topMustDos = snapshot.plan?.tasks
                    ?.filter { it.kind == "must_do" && it.status != "completed" }
                    ?.take(3)
                    ?.joinToString("\n") { "• ${it.title}" }
                    .orEmpty()
                AgentPreferences.setWidgetTasksPreview(context, topMustDos)
                FocusGateWidgetProvider.updateAll(context)
            } catch (e: Exception) {
                if (!silent) syncError = e.message ?: "Could not sync plan."
            } finally {
                backgroundSyncInFlight = false
                if (fromPullToRefresh) userPullRefreshing = false
                if (!silent && !fromPullToRefresh) planSyncBusy = false
            }
        }
    }

    fun signInToWeb() {
        val email = emailInput.trim()
        if (email.isBlank() || passwordInput.isBlank()) {
            syncError = "Enter your email and password."
            return
        }
        planSyncBusy = true
        syncError = null
        scope.launch {
            try {
                val snapshot = withContext(Dispatchers.IO) {
                    PlanSyncManager.signInAndSync(context, email, passwordInput)
                }
                passwordInput = ""
                signedInEmail = AgentPreferences.getUserEmail(context)
                planSnapshot = snapshot
                planUnlocked = snapshot.unlocked
                banner = "Synced with FocusGate web."
            } catch (e: Exception) {
                syncError = e.message ?: "Sign in failed."
            } finally {
                planSyncBusy = false
            }
        }
    }

    fun completeTaskFromPhone(planTaskId: String) {
        if (completingTaskId != null) return
        completingTaskId = planTaskId
        syncError = null
        scope.launch {
            try {
                val snapshot = withContext(Dispatchers.IO) {
                    PlanSyncManager.completeTaskAndSync(context, planTaskId)
                }
                planSnapshot = snapshot
                planUnlocked = snapshot.unlocked
                if (snapshot.unlocked) {
                    banner = "All planned tasks completed — restricted apps are now unlocked!"
                }
            } catch (e: Exception) {
                syncError = e.message ?: "Could not complete task."
            } finally {
                completingTaskId = null
            }
        }
    }

    fun signOutFromWeb() {
        AgentPreferences.clearAuthSession(context)
        signedInEmail = null
        planSnapshot = null
        planUnlocked = false
        syncError = null
    }

    fun applyOutcome(outcome: PolicyOperationOutcome, seq: Int? = null) {
        val state = outcome.state
        val hadUnsaved = pendingBlocked != savedBlocked || pendingExempt != savedExempt
        savedBlocked = state.savedBlocked
        savedExempt = state.savedExempt
        if (!hadUnsaved && outcome.savedSuccessfully) {
            pendingBlocked = state.savedBlocked
            pendingExempt = state.savedExempt
        }
        monitorEnabled = state.monitorEnabled
        managedEnabled = state.managedEnabled
        deviceOwner = state.deviceOwner
        managedAudit = outcome.audit
        deviceEssential = state.deviceEssential
        serviceRunning = AppUsageMonitorService.isRunning
        monitorAppliedBlocked = AppUsageMonitorService.appliedBlockedPackages
        monitorAppliedExempt = AppUsageMonitorService.appliedExemptPackages
        emergencyRemaining = EmergencyAccess.remainingMillis(context)
        if (seq == null || seq == operationSequence) {
            outcome.bannerMessage?.let { banner = it }
        }
    }

    fun runPolicyOperation(
        clearPendingIfSaved: Boolean = false,
        block: suspend () -> PolicyOperationOutcome,
    ) {
        val seq = ++operationSequence
        activeOperations++
        scope.launch {
            try {
                val outcome = withContext(Dispatchers.IO) { block() }
                if (clearPendingIfSaved && outcome.savedSuccessfully) {
                    pendingBlocked = outcome.state.savedBlocked
                    pendingExempt = outcome.state.savedExempt
                }
                applyOutcome(outcome, seq)
            } finally {
                activeOperations = (activeOperations - 1).coerceAtLeast(0)
            }
        }
    }

    fun refreshRuntime() {
        usageGranted = PermissionChecks.hasUsageAccess(context)
        overlayGranted = PermissionChecks.hasOverlayAccess(context)
        notificationsGranted = PermissionChecks.hasNotificationPermission(context)
        val prevEssential = deviceEssential
        scope.launch {
            val outcome = withContext(Dispatchers.IO) { coordinator.auditCurrentPolicy() }
            applyOutcome(outcome)
            if (outcome.state.deviceEssential != prevEssential) {
                apps = withContext(Dispatchers.IO) { loadLauncherApps(context) }
            }
        }
    }

    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                refreshRuntime()
                syncPlanFromWeb(silent = true)
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    LaunchedEffect(signedInEmail) {
        if (signedInEmail != null) {
            while (true) {
                syncPlanFromWeb(silent = true)
                delay(15_000L)
            }
        }
    }

    LaunchedEffect(Unit) {
        apps = withContext(Dispatchers.IO) { loadLauncherApps(context) }
        val rows = withContext(Dispatchers.IO) {
            database.blockedAppDao().observeAll().first()
        }
        ruleLabels = rows.associate { it.packageName to it.label }
        val loadedBlocked = rows.filter { it.enabled && !it.isExempt }.map { it.packageName }.toSet()
        val loadedExempt = rows.filter { it.enabled && it.isExempt }.map { it.packageName }.toSet()
        savedBlocked = loadedBlocked
        savedExempt = loadedExempt
        pendingBlocked = loadedBlocked
        pendingExempt = loadedExempt
        refreshRuntime()
    }

    LaunchedEffect(Unit) {
        var wasEmergency = EmergencyAccess.remainingMillis(context) > 0L
        while (true) {
            val nextRemaining = EmergencyAccess.remainingMillis(context)
            emergencyRemaining = nextRemaining
            serviceRunning = AppUsageMonitorService.isRunning
            monitorAppliedBlocked = AppUsageMonitorService.appliedBlockedPackages
            monitorAppliedExempt = AppUsageMonitorService.appliedExemptPackages
            val nowEmergency = nextRemaining > 0L
            if (wasEmergency && !nowEmergency) {
                refreshRuntime()
            }
            wasEmergency = nowEmergency
            delay(1_000)
        }
    }

    val hasUnsavedChanges = pendingBlocked != savedBlocked || pendingExempt != savedExempt
    val managedActive = managedEnabled && deviceOwner
    val managedDeviceOwnerLost = BuildConfig.MANAGED_MODE &&
        (managedEnabled || managedAudit.trackedPackages.isNotEmpty()) &&
        !deviceOwner
    val savedEffectiveBlocked = PolicyEvaluator.effectiveBlocked(
        blockedPackages = savedBlocked,
        exemptPackages = savedExempt,
        ownPackage = context.packageName,
        deviceEssential = deviceEssential,
    )
    val emergencyActive = emergencyRemaining > 0L
    val managedUnsuspended = if (managedActive && monitorEnabled && !emergencyActive) {
        managedAudit.requiredNotSuspended.size
    } else {
        0
    }
    val managedExtraSuspended = when {
        !BuildConfig.MANAGED_MODE -> 0
        !monitorEnabled || emergencyActive -> managedAudit.verifiedSuspended.size
        managedActive -> managedAudit.extraSuspended.size
        else -> managedAudit.verifiedSuspended.size
    }
    val managedUnknown = if (BuildConfig.MANAGED_MODE &&
        (managedEnabled || managedAudit.trackedPackages.isNotEmpty() || managedAudit.unknownPackages.isNotEmpty())
    ) {
        managedAudit.unknownPackages.size
    } else {
        0
    }
    val monitorPolicySynced = !serviceRunning || (
        PolicyEvaluator.effectiveBlocked(
            blockedPackages = monitorAppliedBlocked,
            exemptPackages = monitorAppliedExempt,
            ownPackage = context.packageName,
            deviceEssential = deviceEssential,
        ) == savedEffectiveBlocked
        )
    val protection = ProtectionEvaluator.evaluate(
        monitorEnabled = monitorEnabled,
        restrictedAppCount = savedEffectiveBlocked.size,
        usageAccess = usageGranted,
        overlayAccess = overlayGranted,
        serviceRunning = serviceRunning,
        managedEnforced = managedActive && !emergencyActive,
        emergencyActive = emergencyActive,
        managedUnsuspendedCount = managedUnsuspended,
        managedExtraSuspendedCount = managedExtraSuspended,
        managedUnknownCount = managedUnknown,
        managedDeviceOwnerLost = managedDeviceOwnerLost,
        hasUnsavedChanges = hasUnsavedChanges,
        monitorPolicySynced = monitorPolicySynced,
    )

    fun savePolicy() {
        val nextBlocked = pendingBlocked
        val nextExempt = pendingExempt
        runPolicyOperation(clearPendingIfSaved = true) {
            coordinator.savePolicy(nextBlocked, nextExempt)
        }
    }

    fun applyManagedPolicy() {
        runPolicyOperation { coordinator.applyManagedPolicy() }
    }

    fun clearManagedSuspensions() {
        runPolicyOperation { coordinator.restoreSuspendedApps() }
    }

    fun setMonitoring(enabled: Boolean) {
        runPolicyOperation { coordinator.setMonitoring(enabled) }
    }

    fun setManaged(enabled: Boolean) {
        runPolicyOperation { coordinator.setManagedMode(enabled) }
    }

    fun startEmergency() {
        runPolicyOperation { coordinator.startEmergency(EmergencyAccess.DEFAULT_MINUTES) }
    }

    fun endEmergency() {
        runPolicyOperation { coordinator.endEmergency() }
    }

    if (showEmergencyDialog) {
        AlertDialog(
            onDismissRequest = { showEmergencyDialog = false },
            title = { Text(tr("Use emergency access?", "Dùng quyền truy cập khẩn cấp?")) },
            text = {
                Text(
                    tr(
                        "This pauses all FocusGate restrictions for 10 minutes. The status " +
                            "screen will show that protection is paused, and it resumes automatically.",
                        "Thao tác này tạm dừng toàn bộ giới hạn FocusGate trong 10 phút. Màn hình " +
                            "trạng thái sẽ hiển thị đang tạm dừng và tự kích hoạt lại sau đó.",
                    ),
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        showEmergencyDialog = false
                        startEmergency()
                    },
                ) { Text(tr("Start 10-minute access", "Bắt đầu 10 phút khẩn cấp")) }
            },
            dismissButton = {
                TextButton(onClick = { showEmergencyDialog = false }) {
                    Text(tr("Cancel", "Hủy"))
                }
            },
        )
    }

    if (showAddTaskDialog) {
        ModalBottomSheet(
            onDismissRequest = { if (!addTaskBusy) showAddTaskDialog = false },
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp)
                    .padding(bottom = 28.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    tr("Add new task", "Thêm nhiệm vụ mới"),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                OutlinedTextField(
                    value = newTaskTitle,
                    onValueChange = { newTaskTitle = it },
                    label = { Text(tr("Task title", "Tên nhiệm vụ")) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf(
                        "must_do" to tr("Must do", "Bắt buộc"),
                        "should_do" to tr("Should do", "Nên làm"),
                        "bonus" to tr("Bonus", "Thưởng"),
                    ).forEach { (kindKey, label) ->
                        FilterChip(
                            selected = newTaskKind == kindKey,
                            onClick = { newTaskKind = kindKey },
                            label = { Text(label) },
                        )
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf(0, 15, 25, 45).forEach { mins ->
                        FilterChip(
                            selected = newTaskFocusMinutes == mins,
                            onClick = { newTaskFocusMinutes = mins },
                            label = {
                                Text(
                                    if (mins == 0) tr("0m", "0p") else "${mins}m",
                                )
                            },
                        )
                    }
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(
                        tr("Add to today's plan", "Thêm vào kế hoạch hôm nay"),
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.weight(1f),
                    )
                    Switch(
                        checked = newTaskAddToToday,
                        onCheckedChange = { newTaskAddToToday = it },
                    )
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    OutlinedButton(
                        enabled = !addTaskBusy,
                        onClick = { showAddTaskDialog = false },
                        modifier = Modifier.weight(1f),
                    ) {
                        Text(tr("Cancel", "Hủy"))
                    }
                    Button(
                        enabled = !addTaskBusy && newTaskTitle.trim().isNotEmpty(),
                        modifier = Modifier.weight(1f),
                        onClick = {
                            val title = newTaskTitle.trim()
                            if (title.isEmpty()) return@Button
                            addTaskBusy = true
                            syncError = null
                            scope.launch {
                                try {
                                    val snap = withContext(Dispatchers.IO) {
                                        PlanSyncManager.createTaskAndSync(
                                            context = context,
                                            title = title,
                                            kind = newTaskKind,
                                            requiredFocusMinutes = newTaskFocusMinutes,
                                            addToTodayPlan = newTaskAddToToday,
                                        )
                                    }
                                    planSnapshot = snap
                                    planUnlocked = snap.unlocked
                                    language = AgentPreferences.getLanguage(context)
                                    newTaskTitle = ""
                                    showAddTaskDialog = false
                                    banner = tr(
                                        "Task saved and synced to FocusGate Web.",
                                        "Đã thêm nhiệm vụ và đồng bộ lên FocusGate Web.",
                                    )
                                } catch (t: Throwable) {
                                    syncError = t.message ?: tr("Could not add task", "Không thể thêm nhiệm vụ")
                                    showAddTaskDialog = false
                                } finally {
                                    addTaskBusy = false
                                }
                            }
                        },
                    ) {
                        Text(if (addTaskBusy) tr("Saving...", "Đang lưu...") else tr("Save", "Lưu"))
                    }
                }
            }
        }
    }

    if (showSanctuaryFullscreen) {
        val endsAt = AgentPreferences.getActiveFocusEndsAt(context)
            .takeIf { it > System.currentTimeMillis() }
            ?: (System.currentTimeMillis() + 25 * 60_000L)
        FocusSanctuaryOverlay(
            taskTitle = AgentPreferences.getActiveFocusTitle(context)
                ?: tr("Deep Focus Sprint", "Phiên tập trung sâu"),
            endsAtEpochMs = endsAt,
            startedAtEpochMs = AgentPreferences.getActiveFocusStartedAt(context),
            isOpenEnded = AgentPreferences.getActiveFocusMode(context) == "open_ended",
            totalDurationMs = AgentPreferences.getActiveFocusPlannedMinutes(context) * 60_000L,
            themePreset = themePreset,
            isVi = isVi,
            onComplete = {
                AgentPreferences.setActiveFocusRunning(context, false)
                AgentPreferences.setActiveFocusEndsAt(context, 0L)
                Notifications.cancelLiveFocusNotification(context)
                showSanctuaryFullscreen = false
            },
            onDismiss = { showSanctuaryFullscreen = false },
        )
    }

    if (showThemePickerSheet) {
        ModalBottomSheet(onDismissRequest = { showThemePickerSheet = false }) {
            ThemePickerSheetContent(
                currentPreset = themePreset,
                isVi = isVi,
                onSelect = { preset ->
                    haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                    onThemePresetChange(preset)
                    showThemePickerSheet = false
                },
            )
        }
    }

    if (showScratchpadSheet) {
        ModalBottomSheet(onDismissRequest = { showScratchpadSheet = false }) {
            ScratchpadSheetContent(
                initialText = AgentPreferences.getQuickScratchpad(context),
                isVi = isVi,
                onSave = { AgentPreferences.setQuickScratchpad(context, it) },
                onDismiss = { showScratchpadSheet = false },
            )
        }
    }

    if (showSoundscapeSheet) {
        ModalBottomSheet(onDismissRequest = { showSoundscapeSheet = false }) {
            SoundscapeMixerSheetContent(
                isPlaying = soundscapePlaying,
                activeMode = activeSoundMode,
                isVi = isVi,
                onSelectMode = { mode ->
                    activeSoundMode = mode
                    FocusSoundscapePlayer.setMode(mode)
                    if (!soundscapePlaying) {
                        FocusSoundscapePlayer.start(mode)
                        soundscapePlaying = true
                    }
                },
                onTogglePlay = {
                    if (soundscapePlaying) {
                        FocusSoundscapePlayer.stop()
                        soundscapePlaying = false
                    } else {
                        FocusSoundscapePlayer.start(activeSoundMode)
                        soundscapePlaying = true
                    }
                },
            )
        }
    }

    if (showQuickStatsSheet) {
        val planTasksList = planSnapshot?.plan?.tasks.orEmpty()
        val doneCount = planTasksList.count { it.status == "completed" }
        val totalCount = planTasksList.size
        val dayLabels = if (isVi) listOf("T2", "T3", "T4", "T5", "T6", "T7", "CN") else listOf("M", "T", "W", "T", "F", "S", "S")
        val weeklyBars = dayLabels.mapIndexed { idx, label ->
            val v = if (idx == dayLabels.lastIndex) (doneCount * 20).coerceAtLeast(10) else ((idx + 2) * 18) % 95 + 15
            label to v
        }
        ModalBottomSheet(onDismissRequest = { showQuickStatsSheet = false }) {
            QuickStatsSheetContent(
                completedToday = doneCount,
                totalToday = totalCount,
                blockedCount = pendingBlocked.size,
                weeklyBars = weeklyBars,
                recentFocusTitle = AgentPreferences.getActiveFocusTitle(context),
                initialReflection = AgentPreferences.getDailyReflection(context),
                onSaveReflection = { AgentPreferences.setDailyReflection(context, it) },
                isVi = isVi,
            )
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(34.dp)
                                .clip(RoundedCornerShape(10.dp))
                                .background(Color(0xFF181414)),
                            contentAlignment = Alignment.Center,
                        ) {
                            Image(
                                painter = painterResource(id = R.drawable.ic_focusgate_mark),
                                contentDescription = "FocusGate logo",
                                modifier = Modifier.size(22.dp),
                            )
                        }
                        Spacer(Modifier.width(10.dp))
                        Column {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                            ) {
                                Text(
                                    "FocusGate",
                                    fontWeight = FontWeight.SemiBold,
                                    maxLines = 1,
                                    softWrap = false,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                val topPlanTasks = planSnapshot?.plan?.tasks?.filter { it.kind == "must_do" }.orEmpty()
                                val topProgress = if (topPlanTasks.isNotEmpty()) {
                                    topPlanTasks.count { it.status == "completed" }.toFloat() / topPlanTasks.size.toFloat()
                                } else {
                                    0f
                                }
                                val ringPrimary = MaterialTheme.colorScheme.primary
                                val ringTrack = MaterialTheme.colorScheme.surfaceVariant
                                Canvas(modifier = Modifier.size(18.dp)) {
                                    val st = Stroke(width = 2.5.dp.toPx(), cap = StrokeCap.Round)
                                    drawArc(ringTrack, -90f, 360f, false, style = st)
                                    drawArc(ringPrimary, -90f, 360f * topProgress, false, style = st)
                                }
                            }
                            Text(
                                tr(
                                    "Finish your tasks. Earn your freedom.",
                                    "Hoàn thành nhiệm vụ. Tự do giải trí.",
                                ),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                },
                actions = {
                    TextButton(
                        onClick = {
                            haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                            showQuickStatsSheet = true
                        },
                    ) {
                        Text(tr("Stats", "Số liệu"), maxLines = 1, softWrap = false)
                    }
                    TextButton(
                        onClick = {
                            haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                            showThemePickerSheet = true
                        },
                    ) {
                        Text(tr("Theme", "Màu"))
                    }
                    TextButton(onClick = onOpenSetup) { Text(tr("Setup", "Thiết lập")) }
                },
            )
        },
        bottomBar = {
            Column {
                val activeFocusRunning = AgentPreferences.isActiveFocusRunning(context)
                val activeFocusTitle = AgentPreferences.getActiveFocusTitle(context)
                if (soundscapePlaying || activeFocusRunning) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 14.dp, vertical = 6.dp)
                            .clip(RoundedCornerShape(18.dp))
                            .background(MaterialTheme.colorScheme.surfaceVariant)
                            .padding(horizontal = 14.dp, vertical = 9.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.weight(1f),
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(9.dp)
                                    .clip(RoundedCornerShape(999.dp))
                                    .background(Color(0xFF34D399)),
                            )
                            Column {
                                Text(
                                    text = if (activeFocusRunning) {
                                        activeFocusTitle ?: tr("Focus session running", "Đang tập trung")
                                    } else {
                                        tr("Ambient soundscape playing", "Đang phát âm thanh tập trung")
                                    },
                                    style = MaterialTheme.typography.labelMedium,
                                    fontWeight = FontWeight.SemiBold,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                Text(
                                    text = if (soundscapePlaying) {
                                        tr("Tap Stop to mute audio", "Chạm Dừng để tắt âm thanh")
                                    } else {
                                        tr("Tap Web to open timer", "Mở tab Web để xem đồng hồ")
                                    },
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    maxLines = 1,
                                )
                            }
                        }
                        if (soundscapePlaying) {
                            TextButton(
                                onClick = {
                                    haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                    FocusSoundscapePlayer.stop()
                                    soundscapePlaying = false
                                },
                            ) {
                                Text(tr("Stop", "Dừng"))
                            }
                        } else {
                            Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                                TextButton(
                                    onClick = {
                                        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                        showSanctuaryFullscreen = true
                                    },
                                ) {
                                    Text(tr("Full", "Toàn MH"))
                                }
                                TextButton(onClick = { bottomTab = HomeBottomTab.WEB }) {
                                    Text(tr("Open", "Mở"))
                                }
                            }
                        }
                    }
                }
                // FocusGate 7.0: Floating Pill Bottom Navigation Dock
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 10.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Surface(
                        shape = RoundedCornerShape(28.dp),
                        tonalElevation = 6.dp,
                        shadowElevation = 8.dp,
                        color = MaterialTheme.colorScheme.surfaceContainerHighest,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 8.dp, vertical = 6.dp),
                            horizontalArrangement = Arrangement.SpaceEvenly,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            val navTabs = listOf(
                                Triple(HomeBottomTab.TODAY, tr("Today", "Hôm nay"), "today"),
                                Triple(HomeBottomTab.WEB, tr("Web", "Web"), "web"),
                                Triple(
                                    HomeBottomTab.GUARD,
                                    if (pendingBlocked.isNotEmpty()) {
                                        "${tr("Guard", "Bảo vệ")} (${pendingBlocked.size})"
                                    } else {
                                        tr("Guard", "Bảo vệ")
                                    },
                                    "guard",
                                ),
                            )
                            navTabs.forEach { (itemTab, itemLabel, _) ->
                                val selected = bottomTab == itemTab
                                Row(
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(22.dp))
                                        .background(
                                            if (selected) {
                                                MaterialTheme.colorScheme.primaryContainer
                                            } else {
                                                Color.Transparent
                                            },
                                        )
                                        .clickable {
                                            haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                            if (itemTab == HomeBottomTab.TODAY && bottomTab != HomeBottomTab.TODAY) {
                                                bottomTab = HomeBottomTab.TODAY
                                                if (signedInEmail != null) syncPlanFromWeb(silent = true)
                                            } else {
                                                bottomTab = itemTab
                                            }
                                        }
                                        .padding(horizontal = 16.dp, vertical = 9.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                                ) {
                                    when (itemTab) {
                                        HomeBottomTab.TODAY -> NavHomeIcon(active = selected)
                                        HomeBottomTab.WEB -> NavWebIcon(active = selected)
                                        HomeBottomTab.GUARD -> NavGuardIcon(active = selected)
                                    }
                                    Text(
                                        text = itemLabel,
                                        style = MaterialTheme.typography.labelMedium,
                                        fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                                        color = if (selected) {
                                            MaterialTheme.colorScheme.onPrimaryContainer
                                        } else {
                                            MaterialTheme.colorScheme.onSurfaceVariant
                                        },
                                    )
                                }
                            }
                        }
                    }
                }
            }
        },
    ) { innerPadding ->
        Crossfade(targetState = bottomTab, label = "home_tab") { activeTab ->
        if (activeTab == HomeBottomTab.WEB) {
            WebDashboardScreen(
                isVi = isVi,
                onSyncToNative = {
                    if (signedInEmail != null) syncPlanFromWeb()
                    bottomTab = HomeBottomTab.TODAY
                },
                modifier = Modifier.padding(innerPadding),
            )
        } else {
        PullToRefreshBox(
            isRefreshing = userPullRefreshing,
            onRefresh = { if (signedInEmail != null) syncPlanFromWeb(fromPullToRefresh = true) },
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
        ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = 28.dp),
        ) {
            item {
                AnimatedVisibility(visible = planSyncBusy) {
                    LinearProgressIndicator(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(3.dp),
                    )
                }
                banner?.let { message ->
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 6.dp),
                    ) {
                        Row(
                            modifier = Modifier.padding(14.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(message, modifier = Modifier.weight(1f))
                            TextButton(onClick = { banner = null }) {
                                Text(tr("Dismiss", "Đóng"))
                            }
                        }
                    }
                }
            }

            if (bottomTab == HomeBottomTab.TODAY) {
            availableUpdate?.let { update ->
                item {
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 6.dp),
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(14.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    tr(
                                        "Update available: ${update.versionName}",
                                        "Có bản cập nhật mới: ${update.versionName}",
                                    ),
                                    fontWeight = FontWeight.SemiBold,
                                )
                                Text(
                                    tr(
                                        "Tap to download & install directly (no uninstall needed).",
                                        "Chạm để tải & cài đè trực tiếp (không cần gỡ app cũ).",
                                    ),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            Spacer(Modifier.width(8.dp))
                            Button(
                                enabled = !updatingApp,
                                onClick = {
                                    updatingApp = true
                                    scope.launch {
                                        val res = AppUpdater.downloadAndInstall(context, update)
                                        updatingApp = false
                                        res.onFailure {
                                            banner = tr(
                                                "Update download failed: ${it.message}",
                                                "Tải cập nhật thất bại: ${it.message}",
                                            )
                                        }
                                    }
                                },
                            ) {
                                Text(
                                    if (updatingApp) {
                                        tr("Downloading...", "Đang tải...")
                                    } else {
                                        tr("Update", "Cập nhật")
                                    },
                                )
                            }
                        }
                    }
                }
            }
            if (signedInEmail != null) {
                item {
                    val heroPlan = planSnapshot?.plan
                    val mustDoTasks = heroPlan?.tasks?.filter { it.kind == "must_do" }.orEmpty()
                    val mustDoTotal = mustDoTasks.size
                    val mustDoDone = mustDoTasks.count { it.status == "completed" }
                    LivingGateHero(
                        planStatus = heroPlan?.status,
                        mustDoCompleted = mustDoDone,
                        mustDoTotal = mustDoTotal,
                        unlocked = planUnlocked,
                        earnedMinutes = earnedMinutesBalance,
                        isVi = isVi,
                        onAddTask = { showAddTaskDialog = true },
                        onSync = {
                            lastSyncedAtMs = System.currentTimeMillis()
                            syncPlanFromWeb()
                        },
                        syncBusy = planSyncBusy,
                        themePreset = themePreset,
                        strictMode = strictFrictionMode,
                    )
                    if (planUnlocked) {
                        Spacer(Modifier.height(10.dp))
                        Surface(
                            shape = RoundedCornerShape(18.dp),
                            color = MaterialTheme.colorScheme.primaryContainer,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 14.dp, vertical = 10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Text(
                                    text = tr(
                                        "🎉 Gate Unlocked! Enjoy ${earnedMinutesBalance}m earned freedom.",
                                        "🎉 Cổng đã mở! Tận hưởng ${earnedMinutesBalance}p tự do giải trí.",
                                    ),
                                    style = MaterialTheme.typography.labelLarge,
                                    fontWeight = FontWeight.SemiBold,
                                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                                )
                            }
                        }
                    }
                    // FocusGate 8.0: 7-Day Habit Streak Strip + Last-Sync Pill + Soundscape Button
                    Spacer(Modifier.height(10.dp))
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(16.dp))
                            .background(MaterialTheme.colorScheme.surfaceContainerHighest)
                            .padding(horizontal = 12.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(5.dp),
                        ) {
                            val syncedMinAgo = ((System.currentTimeMillis() - lastSyncedAtMs) / 60_000L).coerceAtLeast(0L)
                            Box(
                                modifier = Modifier
                                    .size(7.dp)
                                    .clip(RoundedCornerShape(999.dp))
                                    .background(Color(0xFF34D399)),
                            )
                            Text(
                                text = if (syncedMinAgo == 0L) {
                                    tr("Synced just now", "Đồng bộ vừa xong")
                                } else {
                                    tr("Synced ${syncedMinAgo}m ago", "Đồng bộ ${syncedMinAgo}p trước")
                                },
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            repeat(7) { idx ->
                                val filled = idx < 5 || mustDoDone > 0
                                Box(
                                    modifier = Modifier
                                        .size(8.dp)
                                        .clip(RoundedCornerShape(999.dp))
                                        .background(
                                            if (filled) {
                                                MaterialTheme.colorScheme.primary
                                            } else {
                                                MaterialTheme.colorScheme.outlineVariant
                                            },
                                        ),
                                )
                            }
                            Spacer(Modifier.width(6.dp))
                            TextButton(
                                onClick = {
                                    haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                    showScratchpadSheet = true
                                },
                            ) {
                                Text(tr("Note", "Nháp"), style = MaterialTheme.typography.labelSmall)
                            }
                            TextButton(
                                onClick = {
                                    haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                    showSoundscapeSheet = true
                                },
                            ) {
                                Text(
                                    if (soundscapePlaying) tr("Audio ON", "Âm thanh BẬT") else tr("Audio", "Âm thanh"),
                                    style = MaterialTheme.typography.labelSmall,
                                )
                            }
                        }
                    }
                    // FocusGate 10.0: Daily Focus Goal Progress Bar
                    val estimatedDoneMin = (mustDoDone * 25).coerceAtMost(dailyFocusGoalMin)
                    val goalFraction = (estimatedDoneMin.toFloat() / dailyFocusGoalMin.toFloat()).coerceIn(0f, 1f)
                    Spacer(Modifier.height(8.dp))
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(14.dp))
                            .background(MaterialTheme.colorScheme.surfaceContainerHighest)
                            .clickable {
                                haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                dailyFocusGoalMin = when (dailyFocusGoalMin) {
                                    60 -> 90
                                    90 -> 120
                                    else -> 60
                                }
                            }
                            .padding(horizontal = 12.dp, vertical = 9.dp),
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text(
                                text = tr("Daily Focus Goal (tap to cycle)", "Mục tiêu Tập trung Ngày (chạm để đổi)"),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Text(
                                text = "${estimatedDoneMin}m / ${dailyFocusGoalMin}m",
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.primary,
                            )
                        }
                        Spacer(Modifier.height(6.dp))
                        LinearProgressIndicator(
                            progress = { goalFraction },
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }
                item {
                    var focusRunning by remember { mutableStateOf(AgentPreferences.isActiveFocusRunning(context)) }
                    var focusEndsAt by remember { mutableLongStateOf(AgentPreferences.getActiveFocusEndsAt(context)) }
                    var focusStartedAt by remember { mutableLongStateOf(AgentPreferences.getActiveFocusStartedAt(context)) }
                    var focusMode by remember { mutableStateOf(AgentPreferences.getActiveFocusMode(context)) }
                    var focusPlannedMin by remember { mutableIntStateOf(AgentPreferences.getActiveFocusPlannedMinutes(context)) }
                    var focusSessionId by remember { mutableStateOf(AgentPreferences.getActiveFocusSessionId(context)) }
                    var focusTitle by remember { mutableStateOf(AgentPreferences.getActiveFocusTitle(context)) }
                    var focusBusy by remember { mutableStateOf(false) }
                    var nowTick by remember { mutableLongStateOf(System.currentTimeMillis()) }

                    LaunchedEffect(focusSyncVersion) {
                        focusRunning = AgentPreferences.isActiveFocusRunning(context)
                        focusEndsAt = AgentPreferences.getActiveFocusEndsAt(context)
                        focusStartedAt = AgentPreferences.getActiveFocusStartedAt(context)
                        focusMode = AgentPreferences.getActiveFocusMode(context)
                        focusPlannedMin = AgentPreferences.getActiveFocusPlannedMinutes(context)
                        focusSessionId = AgentPreferences.getActiveFocusSessionId(context)
                        focusTitle = AgentPreferences.getActiveFocusTitle(context)
                    }

                    LaunchedEffect(focusRunning) {
                        while (focusRunning) {
                            nowTick = System.currentTimeMillis()
                            delay(1_000L)
                        }
                    }

                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 6.dp),
                    ) {
                        Column(Modifier.padding(16.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Text(
                                    tr("Quick Focus Timer", "Tập trung nhanh"),
                                    fontWeight = FontWeight.SemiBold,
                                )
                                if (focusRunning) {
                                    val isOpenEnded = focusMode == "open_ended"
                                    val displaySec = if (isOpenEnded && focusStartedAt > 0L) {
                                        ((nowTick - focusStartedAt).coerceAtLeast(0L) / 1000L).toInt()
                                    } else {
                                        ((focusEndsAt - nowTick).coerceAtLeast(0L) / 1000L).toInt()
                                    }
                                    val hrs = displaySec / 3600
                                    val mm = (displaySec % 3600) / 60
                                    val ss = displaySec % 60
                                    val clockText = if (hrs > 0) {
                                        "%d:%02d".format(hrs, mm)
                                    } else {
                                        "%02d:%02d".format(mm, ss)
                                    }
                                    val ringPrimary = MaterialTheme.colorScheme.primary
                                    val ringTrack = MaterialTheme.colorScheme.outline.copy(alpha = 0.45f)
                                    val denom = if (isOpenEnded) 3600f else (focusPlannedMin * 60f).coerceAtLeast(60f)
                                    val sweep = if (isOpenEnded) {
                                        (((displaySec % 3600).toFloat() / denom).coerceIn(0.04f, 1f)) * 360f
                                    } else {
                                        ((displaySec.toFloat() / denom).coerceIn(0.04f, 1f)) * 360f
                                    }
                                    Box(
                                        modifier = Modifier.size(62.dp),
                                        contentAlignment = Alignment.Center,
                                    ) {
                                        Canvas(modifier = Modifier.size(62.dp)) {
                                            val stroke = Stroke(width = 5.dp.toPx(), cap = StrokeCap.Round)
                                            drawArc(
                                                color = ringTrack,
                                                startAngle = -90f,
                                                sweepAngle = 360f,
                                                useCenter = false,
                                                style = stroke,
                                            )
                                            drawArc(
                                                color = ringPrimary,
                                                startAngle = -90f,
                                                sweepAngle = sweep,
                                                useCenter = false,
                                                style = stroke,
                                            )
                                        }
                                        Text(
                                            text = clockText,
                                            style = MaterialTheme.typography.labelMedium,
                                            fontWeight = FontWeight.Bold,
                                            color = ringPrimary,
                                            maxLines = 1,
                                            softWrap = false,
                                        )
                                    }
                                }
                            }
                            Spacer(Modifier.height(4.dp))
                            Text(
                                text = if (focusRunning) {
                                    focusTitle ?: tr("Session synced with FocusGate Web", "Đang đồng bộ với FocusGate Web")
                                } else {
                                    tr("Start a synced focus block right from your phone.", "Bắt đầu phiên tập trung đồng bộ ngay trên điện thoại.")
                                },
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Spacer(Modifier.height(10.dp))
                            if (!focusRunning) {
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    listOf(25, 50).forEach { mins ->
                                        Button(
                                            enabled = !focusBusy,
                                            onClick = {
                                                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                                focusBusy = true
                                                scope.launch {
                                                    try {
                                                        withContext(Dispatchers.IO) {
                                                            PlanSyncManager.startRemoteFocusSession(context, mins)
                                                            PlanSyncManager.syncRemoteFocusSession(context)
                                                        }
                                                        focusRunning = AgentPreferences.isActiveFocusRunning(context)
                                                        focusEndsAt = AgentPreferences.getActiveFocusEndsAt(context)
                                                        focusSessionId = AgentPreferences.getActiveFocusSessionId(context)
                                                        focusTitle = AgentPreferences.getActiveFocusTitle(context)
                                                    } finally {
                                                        focusBusy = false
                                                    }
                                                }
                                            },
                                        ) {
                                            Text(tr("${mins}m Focus", "Tập trung ${mins}p"))
                                        }
                                    }
                                }
                            } else {
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Button(
                                        enabled = !focusBusy && !focusSessionId.isNullOrBlank(),
                                        onClick = {
                                            val sid = focusSessionId ?: return@Button
                                            focusBusy = true
                                            scope.launch {
                                                try {
                                                    withContext(Dispatchers.IO) {
                                                        PlanSyncManager.updateRemoteFocusSession(context, "complete", sid)
                                                        PlanSyncManager.syncRemoteFocusSession(context)
                                                    }
                                                    focusRunning = AgentPreferences.isActiveFocusRunning(context)
                                                    focusSessionId = AgentPreferences.getActiveFocusSessionId(context)
                                                    syncPlanFromWeb()
                                                } finally {
                                                    focusBusy = false
                                                }
                                            }
                                        },
                                    ) {
                                        Text(tr("Complete", "Hoàn thành"))
                                    }
                                    OutlinedButton(
                                        enabled = !focusBusy && !focusSessionId.isNullOrBlank(),
                                        onClick = {
                                            val sid = focusSessionId ?: return@OutlinedButton
                                            focusBusy = true
                                            scope.launch {
                                                try {
                                                    withContext(Dispatchers.IO) {
                                                        PlanSyncManager.updateRemoteFocusSession(context, "cancel", sid)
                                                        PlanSyncManager.syncRemoteFocusSession(context)
                                                    }
                                                    focusRunning = AgentPreferences.isActiveFocusRunning(context)
                                                    focusSessionId = AgentPreferences.getActiveFocusSessionId(context)
                                                } finally {
                                                    focusBusy = false
                                                }
                                            }
                                        },
                                    ) {
                                        Text(tr("Cancel", "Hủy"))
                                    }
                                }
                            }
                        }
                    }
                }
            }

            if (signedInEmail == null) {
                item {
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 6.dp),
                    ) {
                        Column(Modifier.padding(16.dp)) {
                            Text(tr("FocusGate Web Sync", "Đồng bộ Web FocusGate"), fontWeight = FontWeight.SemiBold)
                            Spacer(Modifier.height(4.dp))
                            Text(
                                tr(
                                    "Sign in with your FocusGate web account to sync today's planned tasks and unlock apps when all tasks are done.",
                                    "Đăng nhập tài khoản web FocusGate để đồng bộ kế hoạch hôm nay và mở khóa ứng dụng khi xong hết việc.",
                                ),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Spacer(Modifier.height(10.dp))
                            OutlinedTextField(
                                value = emailInput,
                                onValueChange = { emailInput = it },
                                label = { Text("Email") },
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth(),
                            )
                            Spacer(Modifier.height(8.dp))
                            OutlinedTextField(
                                value = passwordInput,
                                onValueChange = { passwordInput = it },
                                label = { Text(tr("Password", "Mật khẩu")) },
                                singleLine = true,
                                visualTransformation = PasswordVisualTransformation(),
                                modifier = Modifier.fillMaxWidth(),
                            )
                            if (syncError != null) {
                                Text(
                                    syncError!!,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.error,
                                    modifier = Modifier.padding(top = 6.dp),
                                )
                            }
                            Button(
                                onClick = ::signInToWeb,
                                enabled = !planSyncBusy,
                                modifier = Modifier.padding(top = 10.dp),
                            ) {
                                Text(
                                    if (planSyncBusy) {
                                        tr("Signing in...", "Đang đăng nhập...")
                                    } else {
                                        tr("Sign in & Sync", "Đăng nhập & Đồng bộ")
                                    },
                                )
                            }
                        }
                    }
                }
            }

            if (signedInEmail != null) {
                item {
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 6.dp),
                    ) {
                        Column(Modifier.padding(16.dp)) {
                            val currentPlan = planSnapshot?.plan
                            val openWebTasks = planSnapshot?.openTasks.orEmpty()
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(
                                    if (currentPlan != null && currentPlan.tasks.isNotEmpty()) {
                                        tr("Today's Planned Tasks", "Kế hoạch hôm nay")
                                    } else if (openWebTasks.isNotEmpty()) {
                                        tr(
                                            "Open Web Tasks (${openWebTasks.size})",
                                            "Nhiệm vụ đang mở (${openWebTasks.size})",
                                        )
                                    } else {
                                        tr("Today's Planned Tasks", "Kế hoạch hôm nay")
                                    },
                                    fontWeight = FontWeight.SemiBold,
                                    modifier = Modifier.weight(1f),
                                )
                                if (currentPlan != null && currentPlan.allTasksTotal > 0) {
                                    Text(
                                        "${currentPlan.allTasksCompleted}/${currentPlan.allTasksTotal}",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = if (currentPlan.allCompleted) {
                                            MaterialTheme.colorScheme.primary
                                        } else {
                                            MaterialTheme.colorScheme.onSurfaceVariant
                                        },
                                    )
                                }
                                TextButton(
                                    onClick = { showAddTaskDialog = true },
                                    enabled = !planSyncBusy,
                                ) {
                                    Text(tr("+ Add", "+ Thêm"))
                                }
                            }
                            Spacer(Modifier.height(6.dp))
                            when {
                                (currentPlan == null || currentPlan.tasks.isEmpty()) && openWebTasks.isEmpty() -> {
                                    Text(
                                        tr(
                                            "No tasks in today's plan yet. Build today's plan from habits & Must-Dos, or add tasks on FocusGate Web.",
                                            "Chưa có nhiệm vụ trong kế hoạch hôm nay. Bạn có thể tạo tự động từ thói quen & việc Bắt buộc, hoặc thêm trên Web.",
                                        ),
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                    Spacer(Modifier.height(8.dp))
                                    LazyRow(
                                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                                        modifier = Modifier.padding(bottom = 8.dp),
                                    ) {
                                        val quickSuggestions = listOf(
                                            tr("Meditate 10m", "Thiền 10p"),
                                            tr("Read 20m", "Đọc sách 20p"),
                                            tr("Exercise 30m", "Tập thể dục 30p"),
                                        )
                                        items(quickSuggestions) { title ->
                                            FilterChip(
                                                selected = false,
                                                onClick = {
                                                    newTaskTitle = title
                                                    newTaskKind = "must_do"
                                                    showAddTaskDialog = true
                                                },
                                                label = { Text("+ $title") },
                                            )
                                        }
                                    }
                                    Button(
                                        enabled = !planSyncBusy,
                                        onClick = {
                                            planSyncBusy = true
                                            syncError = null
                                            scope.launch {
                                                try {
                                                    val snap = withContext(Dispatchers.IO) {
                                                        PlanSyncManager.buildTodayPlanAndSync(context)
                                                    }
                                                    planSnapshot = snap
                                                    planUnlocked = snap.unlocked
                                                    language = AgentPreferences.getLanguage(context)
                                                } catch (t: Throwable) {
                                                    syncError = t.message ?: tr("Could not build plan", "Không thể lập kế hoạch")
                                                } finally {
                                                    planSyncBusy = false
                                                }
                                            }
                                        },
                                    ) {
                                        Text(
                                            if (planSyncBusy) {
                                                tr("Building...", "Đang tạo...")
                                            } else {
                                                tr("Build Today's Plan", "Lập kế hoạch hôm nay")
                                            },
                                        )
                                    }
                                }
                                (currentPlan == null || currentPlan.tasks.isEmpty()) && openWebTasks.isNotEmpty() -> {
                                    Text(
                                        "Not added to Today's Plan yet — go to Planner on Web to lock them in today's gate:",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        modifier = Modifier.padding(bottom = 6.dp),
                                    )
                                    openWebTasks.take(10).forEach { task ->
                                        Row(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .padding(vertical = 4.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                        ) {
                                            Column(Modifier.weight(1f)) {
                                                Text(
                                                    task.title,
                                                    style = MaterialTheme.typography.bodyMedium,
                                                    fontWeight = FontWeight.Medium,
                                                    maxLines = 2,
                                                    overflow = TextOverflow.Ellipsis,
                                                )
                                                val meta = buildString {
                                                    append(
                                                        when (task.kind) {
                                                            "must_do" -> "Must do"
                                                            "should_do" -> "Should do"
                                                            else -> "Bonus"
                                                        },
                                                    )
                                                    if (task.requiredFocusMinutes > 0) {
                                                        append(tr(" • Focus ${task.requiredFocusMinutes}m", " • Tập trung ${task.requiredFocusMinutes}p"))
                                                    }
                                                }
                                                Text(
                                                    meta,
                                                    style = MaterialTheme.typography.bodySmall,
                                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                )
                                            }
                                        }
                                    }
                                    Spacer(Modifier.height(8.dp))
                                    LazyRow(
                                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                                        modifier = Modifier.padding(bottom = 8.dp),
                                    ) {
                                        val quickSuggestions = listOf(
                                            tr("Meditate 10m", "Thiền 10p"),
                                            tr("Read 20m", "Đọc sách 20p"),
                                            tr("Exercise 30m", "Tập thể dục 30p"),
                                        )
                                        items(quickSuggestions) { title ->
                                            FilterChip(
                                                selected = false,
                                                onClick = {
                                                    newTaskTitle = title
                                                    newTaskKind = "must_do"
                                                    showAddTaskDialog = true
                                                },
                                                label = { Text("+ $title") },
                                            )
                                        }
                                    }
                                    Button(
                                        enabled = !planSyncBusy,
                                        onClick = {
                                            planSyncBusy = true
                                            syncError = null
                                            scope.launch {
                                                try {
                                                    val snap = withContext(Dispatchers.IO) {
                                                        PlanSyncManager.buildTodayPlanAndSync(context)
                                                    }
                                                    planSnapshot = snap
                                                    planUnlocked = snap.unlocked
                                                    language = AgentPreferences.getLanguage(context)
                                                } catch (t: Throwable) {
                                                    syncError = t.message ?: tr("Could not build plan", "Không thể lập kế hoạch")
                                                } finally {
                                                    planSyncBusy = false
                                                }
                                            }
                                        },
                                    ) {
                                        Text(
                                            if (planSyncBusy) {
                                                tr("Building...", "Đang tạo...")
                                            } else {
                                                tr("Build Today's Plan", "Lập kế hoạch hôm nay")
                                            },
                                        )
                                    }
                                }
                                currentPlan != null -> {
                                    if (currentPlan.allTasksTotal > 0) {
                                        val progressFrac = (currentPlan.allTasksCompleted.toFloat() / currentPlan.allTasksTotal.toFloat()).coerceIn(0f, 1f)
                                        LinearProgressIndicator(
                                            progress = { progressFrac },
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .height(5.dp)
                                                .clip(RoundedCornerShape(999.dp)),
                                            color = if (currentPlan.allCompleted) Color(0xFF34D399) else MaterialTheme.colorScheme.primary,
                                        )
                                        Spacer(Modifier.height(8.dp))
                                    }
                                    var todayFilter by remember { mutableStateOf("all") }
                                    Row(
                                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                                        modifier = Modifier.padding(bottom = 6.dp),
                                    ) {
                                        FilterChip(
                                            selected = todayFilter == "all",
                                            onClick = { todayFilter = "all" },
                                            label = { Text(tr("All", "Tất cả")) },
                                        )
                                        FilterChip(
                                            selected = todayFilter == "must_do",
                                            onClick = { todayFilter = "must_do" },
                                            label = { Text(tr("Must do", "Bắt buộc")) },
                                        )
                                        FilterChip(
                                            selected = todayFilter == "pending",
                                            onClick = { todayFilter = "pending" },
                                            label = { Text(tr("Pending", "Chưa xong")) },
                                        )
                                    }
                                    val filteredSource = when (todayFilter) {
                                        "must_do" -> currentPlan.tasks.filter { it.kind == "must_do" }
                                        "pending" -> currentPlan.tasks.filter { it.status != "completed" }
                                        else -> currentPlan.tasks
                                    }
                                    val pendingTasks = filteredSource.filter { it.status != "completed" }
                                    val completedTasks = filteredSource.filter { it.status == "completed" }
                                    val orderedTasks = if (showCompletedTodayTasks) {
                                        pendingTasks + completedTasks
                                    } else {
                                        pendingTasks
                                    }
                                    orderedTasks.forEachIndexed { idx, task ->
                                        val isDone = task.status == "completed"
                                        val dotColor = when (task.kind) {
                                            "must_do" -> MaterialTheme.colorScheme.primary
                                            "should_do" -> MaterialTheme.colorScheme.secondary
                                            else -> MaterialTheme.colorScheme.tertiary
                                        }
                                        val taskRowContent: @Composable () -> Unit = {
                                            Row(
                                                modifier = Modifier
                                                    .fillMaxWidth()
                                                    .background(MaterialTheme.colorScheme.surfaceContainerHighest)
                                                    .padding(vertical = 8.dp),
                                                verticalAlignment = Alignment.CenterVertically,
                                            ) {
                                                Box(
                                                    modifier = Modifier
                                                        .size(8.dp)
                                                        .clip(RoundedCornerShape(999.dp))
                                                        .background(if (isDone) Color(0xFF34D399) else dotColor),
                                                )
                                                Spacer(Modifier.width(10.dp))
                                                Column(Modifier.weight(1f)) {
                                                    Text(
                                                        task.title,
                                                        style = MaterialTheme.typography.bodyMedium,
                                                        fontWeight = if (isDone) FontWeight.Normal else FontWeight.Medium,
                                                        color = if (isDone) {
                                                            MaterialTheme.colorScheme.onSurfaceVariant
                                                        } else {
                                                            MaterialTheme.colorScheme.onSurface
                                                        },
                                                        textDecoration = if (isDone) TextDecoration.LineThrough else TextDecoration.None,
                                                        maxLines = 2,
                                                        overflow = TextOverflow.Ellipsis,
                                                    )
                                                    val meta = buildString {
                                                        append(
                                                            when (task.kind) {
                                                                "must_do" -> tr("Must do", "Bắt buộc")
                                                                "should_do" -> tr("Should do", "Nên làm")
                                                                else -> tr("Bonus", "Thưởng")
                                                            },
                                                        )
                                                        if (task.requiredFocusMinutes > 0) {
                                                            append(tr(" • Focus ${task.focusDone}/${task.requiredFocusMinutes}m", " • Tập trung ${task.focusDone}/${task.requiredFocusMinutes}p"))
                                                        }
                                                    }
                                                    Text(
                                                        meta,
                                                        style = MaterialTheme.typography.bodySmall,
                                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                    )
                                                }
                                                Spacer(Modifier.width(8.dp))
                                                if (isDone) {
                                                    Box(
                                                        modifier = Modifier
                                                            .clip(RoundedCornerShape(999.dp))
                                                            .background(Color(0x1F34D399))
                                                            .padding(horizontal = 10.dp, vertical = 5.dp),
                                                    ) {
                                                        Text(
                                                            tr("✓ Done", "✓ Đã xong"),
                                                            style = MaterialTheme.typography.labelMedium,
                                                            color = Color(0xFF34D399),
                                                            fontWeight = FontWeight.SemiBold,
                                                            maxLines = 1,
                                                            softWrap = false,
                                                        )
                                                    }
                                                } else {
                                                    OutlinedButton(
                                                        onClick = { completeTaskFromPhone(task.planTaskId) },
                                                        enabled = completingTaskId == null,
                                                    ) {
                                                        Text(
                                                            if (completingTaskId == task.planTaskId) "..." else tr("Done", "Xong"),
                                                            maxLines = 1,
                                                            softWrap = false,
                                                        )
                                                    }
                                                }
                                            }
                                        }
                                        if (!isDone) {
                                            val swipeState = rememberSwipeToDismissBoxState(
                                                confirmValueChange = { value ->
                                                    if (value == SwipeToDismissBoxValue.StartToEnd && completingTaskId == null) {
                                                        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                                        completeTaskFromPhone(task.planTaskId)
                                                    } else if (value == SwipeToDismissBoxValue.EndToStart) {
                                                        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                                        val endsAt = System.currentTimeMillis() + 25 * 60_000L
                                                        AgentPreferences.setActiveFocusRunning(context, true)
                                                        AgentPreferences.setActiveFocusEndsAt(context, endsAt)
                                                        AgentPreferences.setActiveFocusTitle(context, task.title)
                                                        Notifications.showLiveFocusNotification(
                                                            context = context,
                                                            taskTitle = task.title,
                                                            endsAtEpochMs = endsAt,
                                                            isPaused = false,
                                                        )
                                                        showSanctuaryFullscreen = true
                                                    }
                                                    false
                                                },
                                            )
                                            SwipeToDismissBox(
                                                state = swipeState,
                                                enableDismissFromEndToStart = true,
                                                backgroundContent = {
                                                    val swipingRight = swipeState.dismissDirection == SwipeToDismissBoxValue.StartToEnd
                                                    val swipingLeft = swipeState.dismissDirection == SwipeToDismissBoxValue.EndToStart
                                                    Box(
                                                        modifier = Modifier
                                                            .fillMaxSize()
                                                            .clip(RoundedCornerShape(12.dp))
                                                            .background(
                                                                when {
                                                                    swipingRight -> Color(0x2E34D399)
                                                                    swipingLeft -> MaterialTheme.colorScheme.primaryContainer
                                                                    else -> Color.Transparent
                                                                },
                                                            )
                                                            .padding(horizontal = 14.dp),
                                                        contentAlignment = if (swipingLeft) Alignment.CenterEnd else Alignment.CenterStart,
                                                    ) {
                                                        if (swipingRight) {
                                                            Text(
                                                                tr("✓ Swipe to complete", "✓ Vuốt để hoàn thành"),
                                                                style = MaterialTheme.typography.labelMedium,
                                                                color = Color(0xFF0D7A58),
                                                                fontWeight = FontWeight.SemiBold,
                                                            )
                                                        } else if (swipingLeft) {
                                                            Text(
                                                                tr("⚡ Focus 25m", "⚡ Tập trung 25p"),
                                                                style = MaterialTheme.typography.labelMedium,
                                                                color = MaterialTheme.colorScheme.onPrimaryContainer,
                                                                fontWeight = FontWeight.SemiBold,
                                                            )
                                                        }
                                                    }
                                                },
                                                content = { taskRowContent() },
                                            )
                                        } else {
                                            taskRowContent()
                                        }
                                        if (idx < orderedTasks.lastIndex) {
                                            HorizontalDivider(
                                                thickness = 0.5.dp,
                                                color = MaterialTheme.colorScheme.outline.copy(alpha = 0.45f),
                                            )
                                        }
                                    }

                                    if (completedTasks.isNotEmpty()) {
                                        TextButton(
                                            onClick = { showCompletedTodayTasks = !showCompletedTodayTasks },
                                            modifier = Modifier.padding(top = 2.dp),
                                        ) {
                                            Text(
                                                if (showCompletedTodayTasks) {
                                                    tr(
                                                        "Hide completed (${completedTasks.size}) ▴",
                                                        "Ẩn việc đã xong (${completedTasks.size}) ▴",
                                                    )
                                                } else {
                                                    tr(
                                                        "Completed (${completedTasks.size}) ▾",
                                                        "Đã hoàn thành (${completedTasks.size} việc) ▾",
                                                    )
                                                },
                                                color = Color(0xFF34D399),
                                                style = MaterialTheme.typography.labelMedium,
                                            )
                                        }
                                    }

                                    val mustDos = currentPlan.tasks.filter { it.kind == "must_do" }
                                    val allMustDosDone = mustDos.isNotEmpty() && mustDos.all { it.status == "completed" }
                                    if ((currentPlan.status == "draft" || currentPlan.status == "confirmed") && mustDos.isNotEmpty()) {
                                        Spacer(Modifier.height(10.dp))
                                        Button(
                                            enabled = !planSyncBusy,
                                            onClick = {
                                                planSyncBusy = true
                                                syncError = null
                                                scope.launch {
                                                    try {
                                                        val snap = withContext(Dispatchers.IO) {
                                                            PlanSyncManager.confirmAndActivatePlanAndSync(context)
                                                        }
                                                        planSnapshot = snap
                                                        planUnlocked = snap.unlocked
                                                        banner = tr(
                                                            "Today's plan confirmed and started.",
                                                            "Đã chốt và bắt đầu kế hoạch hôm nay.",
                                                        )
                                                    } catch (t: Throwable) {
                                                        syncError = t.message ?: tr("Could not start plan", "Không thể bắt đầu kế hoạch")
                                                    } finally {
                                                        planSyncBusy = false
                                                    }
                                                }
                                            },
                                            modifier = Modifier.fillMaxWidth(),
                                        ) {
                                            Text(tr("Confirm & Start Plan", "Xác nhận & bắt đầu kế hoạch"))
                                        }
                                    } else if (currentPlan.status == "active" && allMustDosDone) {
                                        Spacer(Modifier.height(10.dp))
                                        Button(
                                            enabled = !planSyncBusy,
                                            onClick = {
                                                planSyncBusy = true
                                                syncError = null
                                                scope.launch {
                                                    try {
                                                        val (snap, granted) = withContext(Dispatchers.IO) {
                                                            PlanSyncManager.completePlanAndClaimAndSync(context)
                                                        }
                                                        planSnapshot = snap
                                                        planUnlocked = snap.unlocked
                                                        banner = if (granted > 0) {
                                                            tr(
                                                                "Day completed! Unlocked with +${granted}m reward.",
                                                                "Hoàn thành ngày! Đã nhận +${granted} phút thưởng.",
                                                            )
                                                        } else {
                                                            tr(
                                                                "Today's plan completed!",
                                                                "Đã hoàn thành kế hoạch hôm nay!",
                                                            )
                                                        }
                                                    } catch (t: Throwable) {
                                                        syncError = t.message ?: tr("Could not complete day", "Không thể chốt hoàn thành ngày")
                                                    } finally {
                                                        planSyncBusy = false
                                                    }
                                                }
                                            },
                                            modifier = Modifier.fillMaxWidth(),
                                        ) {
                                            Text(tr("Finish Day & Claim Reward", "Hoàn thành ngày & nhận thưởng"))
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            if (signedInEmail != null) {
                item {
                    LaunchedEffect(planSyncBusy) {
                        language = AgentPreferences.getLanguage(context)
                    }
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 6.dp),
                    ) {
                        Column(Modifier.padding(16.dp)) {
                            Text(
                                tr("Daily Health Quick-Log", "Ghi nhanh sức khỏe hôm nay"),
                                fontWeight = FontWeight.SemiBold,
                            )
                            Text(
                                tr(
                                    "Log today's steps, active calories, sleep hours, and weight directly to FocusGate Web.",
                                    "Lưu số bước, calo vận động, giờ ngủ và cân nặng hôm nay lên web FocusGate.",
                                ),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(top = 2.dp),
                            )
                            Spacer(Modifier.height(10.dp))
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                OutlinedTextField(
                                    value = healthStepsInput,
                                    onValueChange = { healthStepsInput = it },
                                    label = { Text(tr("Steps", "Bước chân")) },
                                    singleLine = true,
                                    modifier = Modifier.weight(1f),
                                )
                                OutlinedTextField(
                                    value = healthCaloriesInput,
                                    onValueChange = { healthCaloriesInput = it },
                                    label = { Text(tr("Calories (kcal)", "Calo (kcal)")) },
                                    singleLine = true,
                                    modifier = Modifier.weight(1f),
                                )
                            }
                            Spacer(Modifier.height(8.dp))
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                OutlinedTextField(
                                    value = healthSleepInput,
                                    onValueChange = { healthSleepInput = it },
                                    label = { Text(tr("Sleep (hours)", "Ngủ (giờ)")) },
                                    singleLine = true,
                                    modifier = Modifier.weight(1f),
                                )
                                OutlinedTextField(
                                    value = healthWeightInput,
                                    onValueChange = { healthWeightInput = it },
                                    label = { Text(tr("Weight (kg)", "Cân nặng (kg)")) },
                                    singleLine = true,
                                    modifier = Modifier.weight(1f),
                                )
                            }
                            healthSyncMessage?.let { msg ->
                                Text(
                                    msg,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.padding(top = 6.dp),
                                )
                            }
                            Spacer(Modifier.height(10.dp))
                            Button(
                                enabled = !healthSyncBusy,
                                onClick = {
                                    val steps = healthStepsInput.trim().toIntOrNull() ?: 0
                                    val calories = healthCaloriesInput.trim().toIntOrNull() ?: 0
                                    val sleepHours = healthSleepInput.trim().replace(',', '.').toDoubleOrNull() ?: 0.0
                                    val sleepMinutes = kotlin.math.round(sleepHours * 60.0).toInt().coerceIn(0, 1440)
                                    val weightKg = healthWeightInput.trim().replace(',', '.').toDoubleOrNull()
                                    healthSyncBusy = true
                                    healthSyncMessage = null
                                    scope.launch {
                                        try {
                                            withContext(Dispatchers.IO) {
                                                PlanSyncManager.saveHealthMetricAndSync(
                                                    context = context,
                                                    steps = steps,
                                                    activeCalories = calories,
                                                    sleepMinutes = sleepMinutes,
                                                    weightKg = weightKg,
                                                )
                                            }
                                            healthSyncMessage = tr(
                                                "Saved today's health log to FocusGate Web.",
                                                "Đã lưu chỉ số sức khỏe hôm nay lên web.",
                                            )
                                        } catch (t: Throwable) {
                                            healthSyncMessage = t.message ?: tr("Health sync failed", "Lưu sức khỏe thất bại")
                                        } finally {
                                            healthSyncBusy = false
                                        }
                                    }
                                },
                            ) {
                                Text(
                                    if (healthSyncBusy) {
                                        tr("Saving...", "Đang lưu...")
                                    } else {
                                        tr("Save Health Today", "Lưu sức khỏe hôm nay")
                                    },
                                )
                            }
                        }
                    }
                }
            }
            } // end HomeBottomTab.TODAY

            if (bottomTab == HomeBottomTab.GUARD) {
            item {
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 6.dp),
                ) {
                    Column(Modifier.padding(16.dp)) {
                        Text(
                            tr("Appearance · Theme Studio", "Giao diện · 4 Bảng màu"),
                            fontWeight = FontWeight.SemiBold,
                        )
                        Spacer(Modifier.height(4.dp))
                        Text(
                            tr(
                                "Pick a signature color mood for FocusGate.",
                                "Chọn phong cách màu sắc bạn yêu thích cho FocusGate.",
                            ),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Spacer(Modifier.height(10.dp))
                        val presets = listOf(
                            Triple("auto", tr("Auto", "Tự động"), Color(0xFF78716C)),
                            Triple("crimson", "Crimson", Color(0xFFB91C1C)),
                            Triple("espresso", "Espresso", Color(0xFF28181A)),
                            Triple("matcha", "Kyoto Matcha", Color(0xFF3F6A49)),
                            Triple("nordic", "Nordic Slate", Color(0xFF3B82F6)),
                        )
                        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            items(presets) { (id, label, swatch) ->
                                FilterChip(
                                    selected = themePreset == id,
                                    onClick = {
                                        haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                        onThemePresetChange(id)
                                    },
                                    leadingIcon = {
                                        Box(
                                            modifier = Modifier
                                                .size(10.dp)
                                                .clip(RoundedCornerShape(999.dp))
                                                .background(swatch),
                                        )
                                    },
                                    label = { Text(label) },
                                )
                            }
                        }
                    }
                }
            }
            if (signedInEmail != null) {
                item {
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 6.dp),
                    ) {
                        Column(Modifier.padding(16.dp)) {
                            Text(tr("Account & Sync", "Tài khoản & Đồng bộ"), fontWeight = FontWeight.SemiBold)
                            Spacer(Modifier.height(4.dp))
                            Text(
                                tr("Signed in as $signedInEmail", "Đang đăng nhập: $signedInEmail"),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Spacer(Modifier.height(8.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                OutlinedButton(
                                    onClick = ::syncPlanFromWeb,
                                    enabled = !planSyncBusy,
                                ) {
                                    Text(if (planSyncBusy) "..." else tr("Sync now", "Đồng bộ ngay"))
                                }
                                TextButton(onClick = ::signOutFromWeb) {
                                    Text(tr("Sign out", "Đăng xuất"))
                                }
                            }
                        }
                    }
                }
                item {
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 4.dp),
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 16.dp, vertical = 12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    tr("Strict Friction Challenge", "Chế độ Nghiêm khắc (Ma sát)"),
                                    fontWeight = FontWeight.Medium,
                                )
                                Text(
                                    tr(
                                        "Require typing commitment phrase to emergency-unlock.",
                                        "Bắt buộc gõ câu cam kết khi xin mở khẩn cấp.",
                                    ),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            Switch(
                                checked = strictFrictionMode,
                                onCheckedChange = { enabled ->
                                    strictFrictionMode = enabled
                                    AgentPreferences.setStrictFrictionMode(context, enabled)
                                },
                            )
                        }
                    }
                }
            }
            item {
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 6.dp),
                ) {
                    Column(Modifier.padding(16.dp)) {
                        Text(tr("Protection status", "Trạng thái bảo vệ"), fontWeight = FontWeight.SemiBold)
                        Spacer(Modifier.height(6.dp))
                        Text(
                            when (protection.level) {
                                ProtectionLevel.PROTECTED -> tr("Protected", "Đang bảo vệ")
                                ProtectionLevel.DEGRADED -> tr("Degraded", "Chưa đầy đủ")
                                ProtectionLevel.OFF -> tr("Off", "Đang tắt")
                            },
                            style = MaterialTheme.typography.headlineSmall,
                            color = when (protection.level) {
                                ProtectionLevel.PROTECTED -> MaterialTheme.colorScheme.primary
                                ProtectionLevel.DEGRADED -> MaterialTheme.colorScheme.tertiary
                                ProtectionLevel.OFF -> MaterialTheme.colorScheme.error
                            },
                        )
                        Text(
                            when (protection.level) {
                                ProtectionLevel.PROTECTED ->
                                    tr("Policy verified and fully applied.", "Chính sách đã được xác minh và áp dụng.")
                                ProtectionLevel.DEGRADED ->
                                    tr(
                                        "Action needed: protection is incomplete or has unverified apps.",
                                        "Cần kiểm tra: bảo vệ chưa hoàn tất hoặc có ứng dụng chưa xác minh.",
                                    )
                                ProtectionLevel.OFF ->
                                    tr(
                                        "No active policy and no apps suspended by FocusGate.",
                                        "Chưa có chính sách hoạt động và chưa có ứng dụng nào bị tạm dừng.",
                                    )
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 2.dp),
                        )
                        if (protection.issues.isNotEmpty()) {
                            Text(
                                protection.issues.joinToString(" • "),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(top = 4.dp),
                            )
                        }
                        if (protection.level == ProtectionLevel.DEGRADED &&
                            (protection.managedMissingCount > 0 ||
                                protection.managedExtraSuspendedCount > 0 ||
                                protection.managedUnknownCount > 0)
                        ) {
                            Text(
                                "Not suspended: ${protection.managedMissingCount} • " +
                                    "Extra suspended: ${protection.managedExtraSuspendedCount} • " +
                                    "Unverified: ${protection.managedUnknownCount}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.tertiary,
                                modifier = Modifier.padding(top = 4.dp),
                            )
                            if (deviceOwner) {
                                OutlinedButton(
                                    onClick = {
                                        if (protection.needsManagedRestore) {
                                            clearManagedSuspensions()
                                        } else {
                                            applyManagedPolicy()
                                        }
                                    },
                                    enabled = !isOperationInProgress,
                                    modifier = Modifier.padding(top = 8.dp),
                                ) {
                                    Text(
                                        when {
                                            isOperationInProgress -> "Working..."
                                            protection.needsManagedRestore -> "Restore suspended apps"
                                            else -> "Re-apply policy"
                                        },
                                    )
                                }
                            }
                        }
                        if (protection.hasUnsavedChanges) {
                            Text(
                                "Unsaved changes — active protection still uses the last saved policy.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.tertiary,
                                modifier = Modifier.padding(top = 4.dp),
                            )
                        }
                        Text(
                            if (managedActive) {
                                tr("Mode: Managed Device (Device Owner policy)", "Chế độ: Thiết bị được quản lý (Device Owner)")
                            } else {
                                tr("Mode: Personal Strict Mode", "Chế độ: Nghiêm ngặt Cá nhân")
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 6.dp),
                        )

                        Spacer(Modifier.height(10.dp))
                        StatusRow(
                            title = tr("Usage Access", "Quyền truy cập sử dụng"),
                            granted = usageGranted,
                            grantedLabel = tr("Granted", "Đã cấp"),
                            notGrantedLabel = tr("Not granted", "Chưa cấp"),
                            actionLabel = if (usageGranted) tr("Settings", "Cài đặt") else tr("Grant", "Cấp quyền"),
                            onAction = { PermissionChecks.openUsageAccessSettings(context) },
                        )
                        StatusRow(
                            title = tr("Display over other apps", "Hiển thị trên ứng dụng khác"),
                            granted = overlayGranted,
                            grantedLabel = tr("Granted", "Đã cấp"),
                            notGrantedLabel = tr("Not granted", "Chưa cấp"),
                            actionLabel = if (overlayGranted) tr("Settings", "Cài đặt") else tr("Grant", "Cấp quyền"),
                            onAction = { PermissionChecks.openOverlaySettings(context) },
                        )
                        StatusRow(
                            title = tr("Notifications", "Thông báo"),
                            granted = notificationsGranted,
                            grantedLabel = tr("Granted", "Đã cấp"),
                            notGrantedLabel = tr("Not granted", "Chưa cấp"),
                            actionLabel = tr("Settings", "Cài đặt"),
                            onAction = { PermissionChecks.openAppNotificationSettings(context) },
                        )

                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(top = 6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(tr("Monitoring", "Giám sát"))
                                Text(
                                    when {
                                        managedActive -> tr("Managed by Device Owner policy", "Quản lý bởi Device Owner")
                                        serviceRunning -> tr("Foreground service running", "Dịch vụ nền đang chạy")
                                        monitorEnabled -> tr("Enabled, service not running", "Đã bật, dịch vụ chưa chạy")
                                        else -> tr("Off", "Tắt")
                                    },
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            if (!managedActive && monitorEnabled && !serviceRunning) {
                                TextButton(onClick = { setMonitoring(true) }) {
                                    Text(tr("Restart", "Khởi động lại"))
                                }
                            }
                            Switch(
                                checked = monitorEnabled,
                                onCheckedChange = ::setMonitoring,
                                enabled = !isOperationInProgress,
                            )
                        }
                        Spacer(Modifier.height(10.dp))
                        PermissionHealthCard(
                            usageGranted = usageGranted,
                            overlayGranted = overlayGranted,
                            notificationsGranted = notificationsGranted,
                            isVi = isVi,
                            onOpenSetup = onOpenSetup,
                        )
                        Spacer(Modifier.height(10.dp))
                        val emergencyAvailable = AgentPreferences.canUseEmergencyToday(context)
                        Card(modifier = Modifier.fillMaxWidth()) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 16.dp, vertical = 12.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = tr("Emergency Access (10m/day)", "Quyền Khẩn cấp (10p/ngày)"),
                                        style = MaterialTheme.typography.titleSmall,
                                        fontWeight = FontWeight.SemiBold,
                                    )
                                    Text(
                                        text = if (emergencyAvailable) {
                                            tr("Ready (1/1 remaining today)", "Sẵn sàng (còn 1/1 lần hôm nay)")
                                        } else {
                                            tr("Used today · Resets at 00:00", "Đã dùng hôm nay · Đặt lại lúc 00:00")
                                        },
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                                Text(
                                    text = if (emergencyAvailable) "1/1" else "0/1",
                                    style = MaterialTheme.typography.titleSmall,
                                    fontWeight = FontWeight.Bold,
                                    color = if (emergencyAvailable) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
                                )
                            }
                        }
                        Spacer(Modifier.height(10.dp))
                        BedtimeArcCard(
                            enabled = bedtimeEnabled,
                            onToggle = { enabled ->
                                bedtimeEnabled = enabled
                                AgentPreferences.setBedtimeEnabled(context, enabled)
                            },
                            isVi = isVi,
                        )
                        Spacer(Modifier.height(10.dp))
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(tr("Settings anti-tamper guard", "Chống gỡ qua Cài đặt hệ thống"))
                                Text(
                                    if (settingsGuardEnabled) {
                                        tr("Blocks System Settings while tasks are locked", "Chặn Cài đặt hệ thống khi đang khóa")
                                    } else {
                                        tr("Off", "Tắt")
                                    },
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            Switch(
                                checked = settingsGuardEnabled,
                                onCheckedChange = { enabled ->
                                    settingsGuardEnabled = enabled
                                    AgentPreferences.setSettingsGuardEnabled(context, enabled)
                                },
                            )
                        }
                        Spacer(Modifier.height(10.dp))
                        var soundscapeMode by remember { mutableStateOf(FocusSoundscapePlayer.getMode()) }
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(tr("Focus Soundscape", "Âm thanh tập trung"))
                                Text(
                                    if (soundscapePlaying) {
                                        tr(
                                            "Playing: ${soundscapeMode.labelEn}",
                                            "Đang phát: ${soundscapeMode.labelVi}",
                                        )
                                    } else {
                                        tr("Off", "Tắt")
                                    },
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            Switch(
                                checked = soundscapePlaying,
                                onCheckedChange = {
                                    soundscapePlaying = FocusSoundscapePlayer.toggle(soundscapeMode)
                                },
                            )
                        }
                        LazyRow(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(top = 6.dp),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            items(SoundscapeMode.entries) { mode ->
                                FilterChip(
                                    selected = soundscapeMode == mode,
                                    onClick = {
                                        soundscapeMode = mode
                                        FocusSoundscapePlayer.setMode(mode)
                                        if (!soundscapePlaying) {
                                            soundscapePlaying = FocusSoundscapePlayer.toggle(mode)
                                        }
                                    },
                                    label = { Text(if (isVi) mode.labelVi else mode.labelEn) },
                                )
                            }
                        }
                        if (signedInEmail != null) {
                            Spacer(Modifier.height(10.dp))
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Text(
                                    tr("Earned Time: ${earnedMinutesBalance}m", "Thời gian tích lũy: ${earnedMinutesBalance}p"),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                                OutlinedButton(
                                    enabled = !planSyncBusy && earnedMinutesBalance >= 10,
                                    onClick = {
                                        planSyncBusy = true
                                        syncError = null
                                        scope.launch {
                                            try {
                                                val snap = withContext(Dispatchers.IO) {
                                                    PlanSyncManager.activateUnlockPassAndSync(context, 10)
                                                }
                                                planSnapshot = snap
                                                planUnlocked = snap.unlocked
                                                earnedMinutesBalance = AgentPreferences.getEarnedMinutesBalance(context)
                                            } catch (t: Throwable) {
                                                syncError = t.message ?: tr("Unlock pass failed", "Kích hoạt thẻ thất bại")
                                            } finally {
                                                planSyncBusy = false
                                            }
                                        }
                                    },
                                ) {
                                    Text(tr("Use 10m Pass", "Dùng thẻ 10p"))
                                }
                            }
                        }
                    }
                }
            }

            item {
                val emergencyPresentation = EmergencyStatusEvaluator.evaluateState(
                    emergencyActive = emergencyActive,
                    audit = managedAudit,
                    deviceOwner = deviceOwner,
                    managedEnabled = managedEnabled,
                )
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 6.dp),
                ) {
                    Column(Modifier.padding(16.dp)) {
                        Text(tr("Emergency access", "Truy cập khẩn cấp"), fontWeight = FontWeight.SemiBold)
                        Text(
                            if (emergencyActive) {
                                "${emergencyPresentation.message} ${tr("Remaining", "Còn lại")}: ${formatRemaining(emergencyRemaining)}."
                            } else {
                                tr(
                                    "Temporarily pause restrictions for up to 15 minutes. Use it for urgent access only.",
                                    "Tạm dừng giới hạn tối đa 15 phút. Chỉ sử dụng khi thật sự khẩn cấp.",
                                )
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = if (emergencyPresentation.state == EmergencyPresentationState.EMERGENCY_ACTIVE_DEGRADED) {
                                MaterialTheme.colorScheme.tertiary
                            } else {
                                MaterialTheme.colorScheme.onSurfaceVariant
                            },
                            modifier = Modifier.padding(top = 4.dp),
                        )
                        if (emergencyPresentation.state == EmergencyPresentationState.EMERGENCY_ACTIVE_DEGRADED) {
                            Text(
                                "Still suspended: ${emergencyPresentation.suspendedCount} • " +
                                    "Unknown: ${emergencyPresentation.unknownCount}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.tertiary,
                                modifier = Modifier.padding(top = 4.dp),
                            )
                            if (deviceOwner) {
                                OutlinedButton(
                                    onClick = ::clearManagedSuspensions,
                                    enabled = !isOperationInProgress,
                                    modifier = Modifier.padding(top = 8.dp),
                                ) {
                                    Text(if (isOperationInProgress) "Working..." else "Restore suspended apps")
                                }
                            }
                        }
                        if (emergencyActive) {
                            OutlinedButton(
                                onClick = ::endEmergency,
                                enabled = !isOperationInProgress,
                                modifier = Modifier.padding(top = 8.dp),
                            ) { Text(tr("End emergency access now", "Kết thúc khẩn cấp ngay")) }
                        } else {
                            Button(
                                onClick = { showEmergencyDialog = true },
                                enabled = !isOperationInProgress,
                                modifier = Modifier.padding(top = 8.dp),
                            ) { Text(tr("Emergency access (10 min)", "Truy cập khẩn cấp (10 phút)")) }
                        }
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(top = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(tr("Strict mode (disable emergency)", "Chế độ nghiêm ngặt (tắt khẩn cấp)"))
                                Text(
                                    if (strictNoEmergency) {
                                        tr("Emergency button hidden on lock screen", "Ẩn nút khẩn cấp trên màn hình khóa")
                                    } else {
                                        tr("Max 1/day · 30s wait", "Tối đa 1 lần/ngày · chờ 30 giây")
                                    },
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            Switch(
                                checked = strictNoEmergency,
                                onCheckedChange = { strict ->
                                    strictNoEmergency = strict
                                    AgentPreferences.setStrictNoEmergency(context, strict)
                                },
                            )
                        }
                    }
                }
            }

            if (BuildConfig.MANAGED_MODE) {
                item {
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 6.dp),
                    ) {
                        Column(Modifier.padding(16.dp)) {
                            Text("Managed Device mode", fontWeight = FontWeight.SemiBold)
                            Text(
                                when {
                                    deviceOwner ->
                                        "This device is a Device Owner. Managed mode suspends selected " +
                                            "apps with Android device policy instead of an overlay. It does " +
                                            "not require Usage Access or overlay access."
                                    managedEnabled || managedAudit.trackedPackages.isNotEmpty() -> {
                                        val pendingCount = maxOf(
                                            managedAudit.trackedPackages.size,
                                            managedAudit.unknownPackages.size,
                                        )
                                        if (pendingCount > 0) {
                                            "Device Owner permission was lost. $pendingCount app(s) still " +
                                                "require verification or recovery. Switch to Personal Mode or " +
                                                "restore Device Owner to resume them."
                                        } else {
                                            "Device Owner permission was lost. Switch to Personal Mode to " +
                                                "continue using Personal Strict Mode."
                                        }
                                    }
                                    else ->
                                        "Requires Device Owner provisioning on a fully managed or " +
                                            "dedicated device (usually a factory-reset device). Personal " +
                                            "phones use Personal Strict Mode. FocusGate does not attempt " +
                                            "to become Device Owner by itself."
                                },
                                style = MaterialTheme.typography.bodySmall,
                                color = if (!deviceOwner && (managedEnabled || managedAudit.trackedPackages.isNotEmpty())) {
                                    MaterialTheme.colorScheme.tertiary
                                } else {
                                    MaterialTheme.colorScheme.onSurfaceVariant
                                },
                                modifier = Modifier.padding(top = 4.dp),
                            )
                            if (deviceOwner) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(top = 8.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Text("Apply Device Owner policy", modifier = Modifier.weight(1f))
                                    Switch(
                                        checked = managedEnabled,
                                        onCheckedChange = ::setManaged,
                                        enabled = !isOperationInProgress,
                                    )
                                }
                            } else if (managedEnabled) {
                                OutlinedButton(
                                    onClick = { setManaged(false) },
                                    enabled = !isOperationInProgress,
                                    modifier = Modifier.padding(top = 8.dp),
                                ) {
                                    Text(if (isOperationInProgress) "Switching..." else "Switch to Personal Mode")
                                }
                            }
                        }
                    }
                }
            }

            item {
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 6.dp),
                ) {
                    Column(Modifier.padding(16.dp)) {
                        Text(tr("Rules", "Quy tắc chặn"), fontWeight = FontWeight.SemiBold)
                        Text(
                            tr(
                                "Restricted apps show the block screen. Exempt apps are never blocked, even if they also appear on the restricted list. Phone, messages, settings, permission controllers and the Play Store are always allowed.",
                                "Ứng dụng bị hạn chế sẽ hiển thị màn hình khóa. Ứng dụng miễn trừ không bao giờ bị chặn. Điện thoại, tin nhắn, cài đặt và Play Store luôn được phép.",
                            ),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 4.dp),
                        )
                        Row(
                            modifier = Modifier.padding(top = 10.dp),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            FilterChip(
                                selected = tab == AppTab.RESTRICT,
                                onClick = { tab = AppTab.RESTRICT },
                                label = { Text("${tr("Restrict", "Chặn")} (${pendingBlocked.size})") },
                            )
                            FilterChip(
                                selected = tab == AppTab.EXEMPT,
                                onClick = { tab = AppTab.EXEMPT },
                                label = { Text("${tr("Exempt", "Miễn trừ")} (${pendingExempt.size})") },
                            )
                        }
                        OutlinedTextField(
                            value = search,
                            onValueChange = { search = it },
                            label = { Text(tr("Search apps", "Tìm ứng dụng")) },
                            singleLine = true,
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(top = 10.dp),
                        )
                        // FocusGate 7.0: App Picker 2.0 Smart Categories + Bulk Block
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(top = 8.dp),
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            listOf(
                                "all" to tr("All", "Tất cả"),
                                "social" to tr("Social", "Mạng XH"),
                                "video" to tr("Video", "Video"),
                                "game" to tr("Games", "Game"),
                            ).forEach { (catKey, catLabel) ->
                                FilterChip(
                                    selected = appCategory == catKey,
                                    onClick = {
                                        haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                        appCategory = catKey
                                    },
                                    label = { Text(catLabel, maxLines = 1) },
                                )
                            }
                        }
                        if (appCategory != "all" && tab == AppTab.RESTRICT) {
                            TextButton(
                                onClick = {
                                    haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                    val matching = apps.filter { matchesAppCategory(it.packageName, it.label, appCategory) }
                                        .map { it.packageName }
                                    pendingBlocked = pendingBlocked + matching
                                    pendingExempt = pendingExempt - matching.toSet()
                                },
                                modifier = Modifier.padding(top = 2.dp),
                            ) {
                                Text(tr("Block all in this category", "Chặn nhanh tất cả nhóm này"))
                            }
                        }
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(top = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                if (hasUnsavedChanges) {
                                    tr("Unsaved changes", "Có thay đổi chưa lưu")
                                } else {
                                    tr("Policy is saved", "Chính sách đã được lưu")
                                },
                                style = MaterialTheme.typography.bodySmall,
                                color = if (hasUnsavedChanges) {
                                    MaterialTheme.colorScheme.tertiary
                                } else {
                                    MaterialTheme.colorScheme.onSurfaceVariant
                                },
                                modifier = Modifier.weight(1f),
                            )
                            Button(
                                onClick = ::savePolicy,
                                enabled = hasUnsavedChanges && !isOperationInProgress,
                            ) {
                                Text(
                                    if (isOperationInProgress) tr("Applying…", "Đang lưu…") else tr("Save policy", "Lưu quy tắc"),
                                )
                            }
                        }
                    }
                }
            }

            val visibleApps = apps.filter { app ->
                val matchesSearch = search.isBlank() ||
                    app.label.contains(search, ignoreCase = true) ||
                    app.packageName.contains(search, ignoreCase = true)
                matchesSearch && matchesAppCategory(app.packageName, app.label, appCategory)
            }

            if (visibleApps.isEmpty()) {
                item {
                    Text(
                        "No launchable apps match this search. System apps and FocusGate " +
                            "itself are excluded.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(20.dp),
                    )
                }
            }

            items(visibleApps, key = { it.packageName }) { app ->
                val isRestricted = app.packageName in pendingBlocked
                val isExempt = app.packageName in pendingExempt
                val checked = if (tab == AppTab.RESTRICT) isRestricted else isExempt

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable {
                            if (tab == AppTab.RESTRICT) {
                                if (isRestricted) {
                                    pendingBlocked = pendingBlocked - app.packageName
                                } else {
                                    pendingBlocked = pendingBlocked + app.packageName
                                    pendingExempt = pendingExempt - app.packageName
                                }
                            } else {
                                if (isExempt) {
                                    pendingExempt = pendingExempt - app.packageName
                                } else {
                                    pendingExempt = pendingExempt + app.packageName
                                    pendingBlocked = pendingBlocked - app.packageName
                                }
                            }
                        }
                        .padding(horizontal = 18.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(
                            app.label,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            if (isRestricted) "${app.packageName} • restricted"
                            else if (isExempt) "${app.packageName} • exempt"
                            else app.packageName,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    Spacer(Modifier.width(12.dp))
                    Switch(
                        checked = checked,
                        onCheckedChange = { enable ->
                            if (tab == AppTab.RESTRICT) {
                                if (enable) {
                                    pendingBlocked = pendingBlocked + app.packageName
                                    pendingExempt = pendingExempt - app.packageName
                                } else {
                                    pendingBlocked = pendingBlocked - app.packageName
                                }
                            } else {
                                if (enable) {
                                    pendingExempt = pendingExempt + app.packageName
                                    pendingBlocked = pendingBlocked - app.packageName
                                } else {
                                    pendingExempt = pendingExempt - app.packageName
                                }
                            }
                        },
                    )
                }
            }

            item {
                Text(
                    "No root, no exploits, no hidden surveillance. FocusGate cannot prevent " +
                        "uninstallation or a determined user from revoking permissions. Managed " +
                        "Device mode is the only mode that uses real device policy, and only on " +
                        "legitimately provisioned devices.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(20.dp),
                )
            }
            } // end HomeBottomTab.GUARD
        }
        } // end PullToRefreshBox
        }
        } // end Crossfade
    }
}

@Composable
private fun StatusRow(
    title: String,
    granted: Boolean,
    grantedLabel: String = "Granted",
    notGrantedLabel: String = "Not granted",
    actionLabel: String,
    onAction: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(title)
            Text(
                if (granted) grantedLabel else notGrantedLabel,
                style = MaterialTheme.typography.bodySmall,
                color = if (granted) {
                    MaterialTheme.colorScheme.primary
                } else {
                    MaterialTheme.colorScheme.error
                },
            )
        }
        TextButton(onClick = onAction) { Text(actionLabel) }
    }
}

private fun formatRemaining(millis: Long): String {
    val seconds = ceil(millis / 1000.0).toLong().coerceAtLeast(0)
    return "${seconds / 60}m ${seconds % 60}s"
}

@Composable
private fun NavHomeIcon(active: Boolean) {
    val color = if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
    Canvas(modifier = Modifier.size(20.dp)) {
        val w = size.width
        val h = size.height
        val stroke = Stroke(width = if (active) 2.2.dp.toPx() else 1.8.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
        val path = Path().apply {
            moveTo(w * 0.14f, h * 0.48f)
            lineTo(w * 0.50f, h * 0.16f)
            lineTo(w * 0.86f, h * 0.48f)
            moveTo(w * 0.24f, h * 0.44f)
            lineTo(w * 0.24f, h * 0.84f)
            lineTo(w * 0.76f, h * 0.84f)
            lineTo(w * 0.76f, h * 0.44f)
        }
        drawPath(path = path, color = color, style = stroke)
    }
}

@Composable
private fun NavWebIcon(active: Boolean) {
    val color = if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
    Canvas(modifier = Modifier.size(20.dp)) {
        val w = size.width
        val h = size.height
        val r = w * 0.38f
        val stroke = Stroke(width = if (active) 2.2.dp.toPx() else 1.8.dp.toPx(), cap = StrokeCap.Round)
        drawCircle(color = color, radius = r, center = Offset(w / 2f, h / 2f), style = stroke)
        drawLine(color = color, start = Offset(w / 2f - r, h / 2f), end = Offset(w / 2f + r, h / 2f), strokeWidth = stroke.width)
        drawLine(color = color, start = Offset(w / 2f, h / 2f - r), end = Offset(w / 2f, h / 2f + r), strokeWidth = stroke.width)
    }
}

@Composable
private fun NavGuardIcon(active: Boolean) {
    val color = if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
    Canvas(modifier = Modifier.size(20.dp)) {
        val w = size.width
        val h = size.height
        val stroke = Stroke(width = if (active) 2.2.dp.toPx() else 1.8.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
        val path = Path().apply {
            moveTo(w * 0.50f, h * 0.14f)
            lineTo(w * 0.82f, h * 0.26f)
            lineTo(w * 0.82f, h * 0.52f)
            cubicTo(w * 0.82f, h * 0.72f, w * 0.65f, h * 0.83f, w * 0.50f, h * 0.88f)
            cubicTo(w * 0.35f, h * 0.83f, w * 0.18f, h * 0.72f, w * 0.18f, h * 0.52f)
            lineTo(w * 0.18f, h * 0.26f)
            close()
        }
        drawPath(path = path, color = color, style = stroke)
    }
}
