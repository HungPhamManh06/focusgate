package com.focusgate.app.ui

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.focusgate.app.util.AgentPreferences
import com.focusgate.app.util.PermissionChecks

private const val STEP_COUNT = 4

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OnboardingScreen(onFinished: () -> Unit) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    var step by remember { mutableIntStateOf(0) }
    var usageGranted by remember { mutableStateOf(PermissionChecks.hasUsageAccess(context)) }
    var overlayGranted by remember { mutableStateOf(PermissionChecks.hasOverlayAccess(context)) }
    var notificationsGranted by remember {
        mutableStateOf(PermissionChecks.hasNotificationPermission(context))
    }
    var privacyConsent by remember {
        mutableStateOf(AgentPreferences.hasPrivacyConsent(context))
    }

    fun setConsent(consent: Boolean) {
        privacyConsent = consent
        AgentPreferences.setPrivacyConsent(context, consent)
    }

    val notificationLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { notificationsGranted = PermissionChecks.hasNotificationPermission(context) }

    fun refresh() {
        usageGranted = PermissionChecks.hasUsageAccess(context)
        overlayGranted = PermissionChecks.hasOverlayAccess(context)
        notificationsGranted = PermissionChecks.hasNotificationPermission(context)
    }

    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) refresh()
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("FocusGate setup", fontWeight = FontWeight.SemiBold)
                        Text(
                            "Step ${step + 1} of $STEP_COUNT",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 22.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Spacer(Modifier.height(4.dp))
            LinearProgressIndicator(
                progress = { (step + 1).toFloat() / STEP_COUNT.toFloat() },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(6.dp),
            )

            when (step) {
                0 -> IntroStep(
                    privacyConsent = privacyConsent,
                    onPrivacyConsentChange = ::setConsent,
                )
                1 -> UsageStep(usageGranted)
                2 -> OverlayStep(overlayGranted)
                else -> NotificationStep(
                    notificationsGranted = notificationsGranted,
                    onRequestNotifications = {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                            notificationLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                        } else {
                            notificationsGranted = true
                        }
                    },
                )
            }

            Spacer(Modifier.height(4.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                if (step > 0) {
                    OutlinedButton(onClick = { step -= 1 }) { Text("Back") }
                }
                Spacer(Modifier.weight(1f))
                when (step) {
                    0 -> Button(
                        onClick = { step = 1 },
                        enabled = privacyConsent,
                    ) { Text("Get started") }
                    1 -> Button(
                        onClick = { step = 2 },
                        enabled = usageGranted,
                    ) { Text("Continue") }
                    2 -> Button(
                        onClick = { step = 3 },
                        enabled = overlayGranted,
                    ) { Text("Continue") }
                    else -> Button(onClick = onFinished) { Text("Finish setup") }
                }
            }

            Text(
                "FocusGate is a friction layer, not an uninstall-proof lock. Android lets " +
                    "you revoke these permissions at any time. Emergency access is available " +
                    "for 10 minutes from the block screen and the status page.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(bottom = 24.dp),
            )
        }
    }
}

@Composable
private fun IntroStep(
    privacyConsent: Boolean,
    onPrivacyConsentChange: (Boolean) -> Unit,
) {
    Text(
        "A gate for the apps you choose.",
        style = MaterialTheme.typography.headlineSmall,
        fontWeight = FontWeight.SemiBold,
    )
    Text(
        "FocusGate reads which app is in the foreground, then shows a full-screen " +
            "reminder when you open an app you restricted. It does not read what you do " +
            "inside other apps and it does not use an AccessibilityService.",
        style = MaterialTheme.typography.bodyMedium,
    )
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("What Android will ask for", fontWeight = FontWeight.SemiBold)
            Text("• Usage Access: detect the foreground app.")
            Text("• Display over other apps: show the block screen over that app.")
            Text("• Notifications (optional): keep protection visible and warn you if it stops.")
            Text("• Device Owner is optional and only for managed/dedicated devices.")
        }
    }
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Privacy and consent", fontWeight = FontWeight.SemiBold)
            Text(
                "FocusGate stores package names and timestamps of foreground apps so it can " +
                    "apply the rules you choose. It does not read messages, screen content or " +
                    "keystrokes. Usage Access and Display over other apps can be revoked at any " +
                    "time in Android settings.",
                style = MaterialTheme.typography.bodySmall,
            )
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onPrivacyConsentChange(!privacyConsent) },
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Checkbox(
                    checked = privacyConsent,
                    onCheckedChange = onPrivacyConsentChange,
                    modifier = Modifier.testTag("privacy_consent"),
                )
                Text(
                    "I understand and agree to this local usage monitoring.",
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
        }
    }
}

@Composable
private fun UsageStep(granted: Boolean) {
    val context = LocalContext.current
    Text(
        "1. Allow Usage Access",
        style = MaterialTheme.typography.headlineSmall,
        fontWeight = FontWeight.SemiBold,
    )
    Text(
        "Android's Usage Access screen controls this permission. FocusGate only reads " +
            "foreground/background events and stores app package names with timestamps. " +
            "It does not read screen content, messages or keystrokes.",
        style = MaterialTheme.typography.bodyMedium,
    )
    PermissionCard(
        title = "Usage Access",
        granted = granted,
        actionLabel = "Open Usage Access settings",
        onAction = { PermissionChecks.openUsageAccessSettings(context) },
    )
    if (!granted) {
        Text(
            "Choose FocusGate in the list and enable \"Permit usage access\".",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.error,
        )
    }
}

@Composable
private fun OverlayStep(granted: Boolean) {
    val context = LocalContext.current
    Text(
        "2. Allow display over other apps",
        style = MaterialTheme.typography.headlineSmall,
        fontWeight = FontWeight.SemiBold,
    )
    Text(
        "Android blocks most background activity launches. The user-granted " +
            "\"Display over other apps\" special access is the documented exemption that " +
            "lets FocusGate bring its block screen to the front when a restricted app opens.",
        style = MaterialTheme.typography.bodyMedium,
    )
    PermissionCard(
        title = "Display over other apps",
        granted = granted,
        actionLabel = "Open overlay settings",
        onAction = { PermissionChecks.openOverlaySettings(context) },
    )
    if (!granted) {
        Text(
            "Without this permission FocusGate can still measure usage, but it cannot " +
                "show the block screen, so its status will say protection is degraded.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.error,
        )
    }
}

@Composable
private fun NotificationStep(
    notificationsGranted: Boolean,
    onRequestNotifications: () -> Unit,
) {
    Text(
        "3. Keep protection visible",
        style = MaterialTheme.typography.headlineSmall,
        fontWeight = FontWeight.SemiBold,
    )
    Text(
        "The ongoing notification makes the foreground service visible and warns you " +
            "when a permission is revoked or Android refuses the block screen. " +
            "It is optional, but recommended.",
        style = MaterialTheme.typography.bodyMedium,
    )
    PermissionCard(
        title = "Notifications",
        granted = notificationsGranted,
        actionLabel = if (notificationsGranted) "Granted" else "Allow notifications",
        onAction = onRequestNotifications,
    )
    Text(
        "Next, choose the apps you want to restrict and the apps that must always stay " +
            "available. Phone, messages, system settings and the Play Store are always " +
            "excluded from blocking.",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
private fun PermissionCard(
    title: String,
    granted: Boolean,
    actionLabel: String,
    onAction: () -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(title, fontWeight = FontWeight.SemiBold)
            Text(
                if (granted) "Granted" else "Not granted",
                color = if (granted) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
            )
            TextButton(onClick = onAction) { Text(actionLabel) }
        }
    }
}
