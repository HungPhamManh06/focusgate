package com.focusgate.app.ui

import android.content.Context
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.compose.setContent
import com.focusgate.app.FocusGateApp
import com.focusgate.app.ui.theme.FocusGateTheme
import com.focusgate.app.util.AgentPreferences
import com.focusgate.app.util.EmergencyAccess
import com.focusgate.app.util.PlanSyncManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class LockActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    goHome()
                }
            },
        )

        val appLabel = intent.getStringExtra(EXTRA_APP_LABEL) ?: "This app"

        setContent {
            val preset = AgentPreferences.getAppThemePreset(this)
            FocusGateTheme(preset = preset) {
                BlockOverlayContent(
                    appLabel = appLabel,
                    allowEmergency = AgentPreferences.canUseEmergencyToday(this),
                    onBackHome = ::goHome,
                    onOpenFocusGate = ::openFocusGate,
                    onEmergency = {
                        AgentPreferences.markEmergencyUsedToday(this)
                        startEmergency()
                    },
                    onQuickFocus15 = {
                        CoroutineScope(Dispatchers.IO).launch {
                            runCatching {
                                PlanSyncManager.startRemoteFocusSession(this@LockActivity, 15)
                                PlanSyncManager.syncRemoteFocusSession(this@LockActivity)
                            }
                        }
                        openFocusGate()
                    },
                    isVi = AgentPreferences.getLanguage(this) == "vi",
                    planSummary = AgentPreferences.getPlanSummaryText(this),
                    topPriorityTask = AgentPreferences.getWidgetTasksPreview(this)
                        .lineSequence()
                        .map { it.trim().removePrefix("•").removePrefix("☐").trim() }
                        .firstOrNull { it.isNotBlank() && !it.startsWith("✓") }
                        .orEmpty(),
                    themePreset = preset,
                )
            }
        }
    }

    private fun goHome() {
        val home = Intent(Intent.ACTION_MAIN).apply {
            addCategory(Intent.CATEGORY_HOME)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }
        runCatching { startActivity(home) }
        finish()
    }

    private fun openFocusGate() {
        val launch = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        runCatching { startActivity(launch) }
        finish()
    }

    private fun startEmergency() {
        CoroutineScope(Dispatchers.IO).launch {
            runCatching {
                FocusGateApp.coordinator(applicationContext)
                    .startEmergency(EmergencyAccess.DEFAULT_MINUTES)
            }
        }
        finish()
    }

    companion object {
        private const val EXTRA_APP_LABEL = "app_label"

        fun createIntent(context: Context, appLabel: String): Intent =
            Intent(context, LockActivity::class.java).apply {
                putExtra(EXTRA_APP_LABEL, appLabel)
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP or
                    Intent.FLAG_ACTIVITY_NO_ANIMATION
            }
    }
}
