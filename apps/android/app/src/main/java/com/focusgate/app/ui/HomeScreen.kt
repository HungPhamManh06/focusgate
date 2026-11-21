package com.focusgate.app.ui

import android.content.Intent
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.focusgate.app.BuildConfig
import com.focusgate.app.admin.ManagedDeviceController
import com.focusgate.app.admin.ManagedPolicyAudit
import com.focusgate.app.data.BlockedApp
import com.focusgate.app.data.FocusGateDatabase
import com.focusgate.app.policy.PolicyEvaluator
import com.focusgate.app.policy.ProtectionEvaluator
import com.focusgate.app.policy.ProtectionLevel
import com.focusgate.app.service.AppUsageMonitorService
import com.focusgate.app.util.AgentPreferences
import com.focusgate.app.util.EmergencyAccess
import com.focusgate.app.util.PermissionChecks
import com.focusgate.app.util.ProtectionWatchdog
import com.focusgate.app.util.SystemPackages
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.math.ceil

private enum class AppTab { RESTRICT, EXEMPT }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(onOpenSetup: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val lifecycleOwner = LocalLifecycleOwner.current
    val database = remember { FocusGateDatabase.get(context) }
    val managedController = remember { ManagedDeviceController(context) }

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

    var usageGranted by remember { mutableStateOf(PermissionChecks.hasUsageAccess(context)) }
    var overlayGranted by remember { mutableStateOf(PermissionChecks.hasOverlayAccess(context)) }
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

    fun refreshManagedAudit(
        blockedSet: Set<String> = savedBlocked,
        exemptSet: Set<String> = savedExempt,
    ) {
        managedAudit = if (BuildConfig.MANAGED_MODE && (managedEnabled || managedController.isDeviceOwner())) {
            managedController.auditPolicy(blockedSet, exemptSet)
        } else {
            ManagedPolicyAudit(deviceOwnerValid = managedController.isDeviceOwner())
        }
    }

    fun refreshRuntime() {
        usageGranted = PermissionChecks.hasUsageAccess(context)
        overlayGranted = PermissionChecks.hasOverlayAccess(context)
        notificationsGranted = PermissionChecks.hasNotificationPermission(context)
        monitorEnabled = AgentPreferences.isMonitorEnabled(context)
        managedEnabled = AgentPreferences.isManagedEnforcementEnabled(context)
        deviceOwner = managedController.isDeviceOwner()
        refreshManagedAudit()
        val updatedEssential = SystemPackages.deviceEssential(context)
        if (updatedEssential != deviceEssential) {
            deviceEssential = updatedEssential
            scope.launch {
                apps = withContext(Dispatchers.IO) { loadLauncherApps(context) }
            }
        }
        serviceRunning = AppUsageMonitorService.isRunning
        monitorAppliedBlocked = AppUsageMonitorService.appliedBlockedPackages
        monitorAppliedExempt = AppUsageMonitorService.appliedExemptPackages
        emergencyRemaining = EmergencyAccess.remainingMillis(context)
    }

    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) refreshRuntime()
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
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
        refreshManagedAudit(loadedBlocked, loadedExempt)
    }

    LaunchedEffect(Unit) {
        while (true) {
            emergencyRemaining = EmergencyAccess.remainingMillis(context)
            serviceRunning = AppUsageMonitorService.isRunning
            monitorAppliedBlocked = AppUsageMonitorService.appliedBlockedPackages
            monitorAppliedExempt = AppUsageMonitorService.appliedExemptPackages
            delay(1_000)
        }
    }

    val hasUnsavedChanges = pendingBlocked != savedBlocked || pendingExempt != savedExempt
    val managedActive = managedEnabled && deviceOwner
    val managedDeviceOwnerLost = BuildConfig.MANAGED_MODE && managedEnabled && !deviceOwner
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
    val managedUnknown = if (BuildConfig.MANAGED_MODE && (managedEnabled || managedAudit.trackedPackages.isNotEmpty())) {
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

    fun labelFor(packageName: String): String =
        apps.firstOrNull { it.packageName == packageName }?.label
            ?: ruleLabels[packageName]
            ?: packageName

    fun savePolicy() {
        val nextBlocked = pendingBlocked
        val nextExempt = pendingExempt
        val rows = (nextBlocked + nextExempt).map { packageName ->
            BlockedApp(
                packageName = packageName,
                label = labelFor(packageName),
                category = PolicyEvaluator.categoryFor(packageName, labelFor(packageName)),
                enabled = true,
                isExempt = packageName in nextExempt,
            )
        }
        scope.launch {
            val persisted = runCatching {
                withContext(Dispatchers.IO) { database.blockedAppDao().replaceAll(rows) }
            }
            if (persisted.isFailure) {
                banner = "Could not save policy. Active protection still uses the previous saved policy."
                return@launch
            }
            savedBlocked = nextBlocked
            savedExempt = nextExempt
            ruleLabels = rows.associate { it.packageName to it.label }
            banner = if (managedActive) {
                val result = withContext(Dispatchers.IO) {
                    managedController.applyBlockedPackages(savedBlocked, savedExempt)
                }
                refreshManagedAudit(savedBlocked, savedExempt)
                result.message
            } else {
                refreshManagedAudit(savedBlocked, savedExempt)
                "Policy saved. The monitor reads it immediately."
            }
        }
    }

    fun applyManagedPolicy() {
        val result = managedController.applyBlockedPackages(savedBlocked, savedExempt)
        refreshManagedAudit(savedBlocked, savedExempt)
        banner = result.message
    }

    fun clearManagedSuspensions(): String {
        val result = managedController.clearSuspensions()
        refreshManagedAudit(savedBlocked, savedExempt)
        return result.message
    }

    fun setMonitoring(enabled: Boolean) {
        if (!enabled) {
            AgentPreferences.setMonitorEnabled(context, false)
            monitorEnabled = false
            context.stopService(Intent(context, AppUsageMonitorService::class.java))
            ProtectionWatchdog.cancel(context)
            if (managedActive) clearManagedSuspensions()
            banner = "Protection is off. Selected apps are not being restricted."
            return
        }

        if (!managedActive && (!usageGranted || !overlayGranted)) {
            banner = "Grant Usage Access and Display over other apps before enabling protection."
            return
        }

        AgentPreferences.setMonitorEnabled(context, true)
        monitorEnabled = true

        if (managedActive) {
            context.stopService(Intent(context, AppUsageMonitorService::class.java))
            ProtectionWatchdog.cancel(context)
            applyManagedPolicy()
        } else {
            ProtectionWatchdog.schedule(context)
            runCatching {
                ContextCompat.startForegroundService(
                    context,
                    Intent(context, AppUsageMonitorService::class.java),
                )
            }.onFailure {
                banner = "Android refused to start monitoring. Check permissions and try again."
            }
        }
    }

    fun setManaged(enabled: Boolean) {
        if (!deviceOwner) {
            banner = "Device Owner provisioning is required for Managed Device mode."
            return
        }
        AgentPreferences.setManagedEnforcementEnabled(context, enabled)
        managedEnabled = enabled
        if (enabled) {
            AgentPreferences.setMonitorEnabled(context, true)
            monitorEnabled = true
            context.stopService(Intent(context, AppUsageMonitorService::class.java))
            ProtectionWatchdog.cancel(context)
            applyManagedPolicy()
        } else {
            banner = clearManagedSuspensions()
            if (monitorEnabled && usageGranted && overlayGranted) {
                ProtectionWatchdog.schedule(context)
                runCatching {
                    ContextCompat.startForegroundService(
                        context,
                        Intent(context, AppUsageMonitorService::class.java),
                    )
                }
            }
        }
    }

    fun startEmergency() {
        EmergencyAccess.start(context, EmergencyAccess.DEFAULT_MINUTES)
        if (managedActive) clearManagedSuspensions()
        emergencyRemaining = EmergencyAccess.remainingMillis(context)
        banner = "Emergency access is active. Restrictions resume automatically."
    }

    fun endEmergency() {
        EmergencyAccess.end(context)
        if (managedActive) applyManagedPolicy()
        emergencyRemaining = 0L
        banner = "Emergency access ended."
    }

    if (showEmergencyDialog) {
        AlertDialog(
            onDismissRequest = { showEmergencyDialog = false },
            title = { Text("Use emergency access?") },
            text = {
                Text(
                    "This pauses all FocusGate restrictions for 10 minutes. The status " +
                        "screen will show that protection is paused, and it resumes automatically.",
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        showEmergencyDialog = false
                        startEmergency()
                    },
                ) { Text("Start 10-minute access") }
            },
            dismissButton = {
                TextButton(onClick = { showEmergencyDialog = false }) { Text("Cancel") }
            },
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("FocusGate", fontWeight = FontWeight.SemiBold)
                        Text(
                            "Finish your tasks. Earn your freedom.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                },
                actions = {
                    TextButton(onClick = onOpenSetup) { Text("Setup") }
                },
            )
        },
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = 28.dp),
        ) {
            item {
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
                            TextButton(onClick = { banner = null }) { Text("Dismiss") }
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
                        Text("Protection status", fontWeight = FontWeight.SemiBold)
                        Spacer(Modifier.height(6.dp))
                        Text(
                            when (protection.level) {
                                ProtectionLevel.PROTECTED -> "Protected"
                                ProtectionLevel.DEGRADED -> "Degraded"
                                ProtectionLevel.OFF -> "Off"
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
                                    "Policy verified and fully applied."
                                ProtectionLevel.DEGRADED ->
                                    "Action needed: protection is incomplete or has unverified apps."
                                ProtectionLevel.OFF ->
                                    "No active policy and no apps suspended by FocusGate."
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
                                            banner = clearManagedSuspensions()
                                        } else {
                                            applyManagedPolicy()
                                        }
                                    },
                                    modifier = Modifier.padding(top = 8.dp),
                                ) {
                                    Text(
                                        if (protection.needsManagedRestore) {
                                            "Restore suspended apps"
                                        } else {
                                            "Re-apply policy"
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
                                "Mode: Managed Device (Device Owner policy)"
                            } else {
                                "Mode: Personal Strict Mode"
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 6.dp),
                        )

                        Spacer(Modifier.height(10.dp))
                        StatusRow(
                            title = "Usage Access",
                            granted = usageGranted,
                            actionLabel = if (usageGranted) "Settings" else "Grant",
                            onAction = { PermissionChecks.openUsageAccessSettings(context) },
                        )
                        StatusRow(
                            title = "Display over other apps",
                            granted = overlayGranted,
                            actionLabel = if (overlayGranted) "Settings" else "Grant",
                            onAction = { PermissionChecks.openOverlaySettings(context) },
                        )
                        StatusRow(
                            title = "Notifications",
                            granted = notificationsGranted,
                            actionLabel = "Settings",
                            onAction = { PermissionChecks.openAppNotificationSettings(context) },
                        )

                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(top = 6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text("Monitoring")
                                Text(
                                    when {
                                        managedActive -> "Managed by Device Owner policy"
                                        serviceRunning -> "Foreground service running"
                                        monitorEnabled -> "Enabled, service not running"
                                        else -> "Off"
                                    },
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            if (!managedActive && monitorEnabled && !serviceRunning) {
                                TextButton(onClick = { setMonitoring(true) }) {
                                    Text("Restart")
                                }
                            }
                            Switch(
                                checked = monitorEnabled,
                                onCheckedChange = ::setMonitoring,
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
                        Text("Emergency access", fontWeight = FontWeight.SemiBold)
                        Text(
                            if (emergencyActive) {
                                "Active for ${formatRemaining(emergencyRemaining)}. " +
                                    "Restrictions resume automatically."
                            } else {
                                "Temporarily pause restrictions for up to 15 minutes. " +
                                    "Use it for urgent access only."
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 4.dp),
                        )
                        if (emergencyActive) {
                            OutlinedButton(
                                onClick = ::endEmergency,
                                modifier = Modifier.padding(top = 8.dp),
                            ) { Text("End emergency access now") }
                        } else {
                            Button(
                                onClick = { showEmergencyDialog = true },
                                modifier = Modifier.padding(top = 8.dp),
                            ) { Text("Emergency access (10 min)") }
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
                            if (deviceOwner) {
                                "This device is a Device Owner. Managed mode suspends selected " +
                                    "apps with Android device policy instead of an overlay. It does " +
                                    "not require Usage Access or overlay access."
                            } else {
                                "Requires Device Owner provisioning on a fully managed or " +
                                    "dedicated device (usually a factory-reset device). Personal " +
                                    "phones use Personal Strict Mode. FocusGate does not attempt " +
                                    "to become Device Owner by itself."
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
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
                                )
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
                        Text("Rules", fontWeight = FontWeight.SemiBold)
                        Text(
                            "Restricted apps show the block screen. Exempt apps are never " +
                                "blocked, even if they also appear on the restricted list. " +
                                "Phone, messages, settings, permission controllers and the Play " +
                                "Store are always allowed.",
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
                                label = { Text("Restrict (${pendingBlocked.size})") },
                            )
                            FilterChip(
                                selected = tab == AppTab.EXEMPT,
                                onClick = { tab = AppTab.EXEMPT },
                                label = { Text("Exempt (${pendingExempt.size})") },
                            )
                        }
                        OutlinedTextField(
                            value = search,
                            onValueChange = { search = it },
                            label = { Text("Search apps") },
                            singleLine = true,
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(top = 10.dp),
                        )
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(top = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                if (hasUnsavedChanges) "Unsaved changes" else "Policy is saved",
                                style = MaterialTheme.typography.bodySmall,
                                color = if (hasUnsavedChanges) {
                                    MaterialTheme.colorScheme.tertiary
                                } else {
                                    MaterialTheme.colorScheme.onSurfaceVariant
                                },
                                modifier = Modifier.weight(1f),
                            )
                            Button(onClick = ::savePolicy, enabled = hasUnsavedChanges) {
                                Text("Save policy")
                            }
                        }
                    }
                }
            }

            val visibleApps = apps.filter { app ->
                search.isBlank() ||
                    app.label.contains(search, ignoreCase = true) ||
                    app.packageName.contains(search, ignoreCase = true)
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
        }
    }
}

@Composable
private fun StatusRow(
    title: String,
    granted: Boolean,
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
                if (granted) "Granted" else "Not granted",
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
