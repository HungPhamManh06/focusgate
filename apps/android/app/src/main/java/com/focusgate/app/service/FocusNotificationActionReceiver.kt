package com.focusgate.app.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.focusgate.app.util.AgentPreferences
import com.focusgate.app.util.Notifications
import com.focusgate.app.util.PlanSyncManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Handles Complete & Short Break action buttons directly from the lockscreen
 * Live Focus Notification.
 */
class FocusNotificationActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action ?: return
        val sessionId = AgentPreferences.getActiveFocusSessionId(context)
        val pendingResult = goAsync()

        CoroutineScope(Dispatchers.IO).launch {
            try {
                when (action) {
                    ACTION_COMPLETE_FOCUS -> {
                        AgentPreferences.setActiveFocusRunning(context, false)
                        AgentPreferences.setActiveFocusEndsAt(context, 0L)
                        Notifications.cancelLiveFocusNotification(context)
                        if (!sessionId.isNullOrBlank()) {
                            runCatching {
                                PlanSyncManager.updateRemoteFocusSession(context, "complete", sessionId)
                            }
                        }
                    }
                    ACTION_PAUSE_FOCUS -> {
                        val title = AgentPreferences.getActiveFocusTitle(context) ?: "FocusGate Sprint"
                        Notifications.showLiveFocusNotification(
                            context = context,
                            taskTitle = title,
                            endsAtEpochMs = System.currentTimeMillis(),
                            isPaused = true,
                        )
                        if (!sessionId.isNullOrBlank()) {
                            runCatching {
                                PlanSyncManager.updateRemoteFocusSession(context, "pause", sessionId)
                            }
                        }
                    }
                }
            } finally {
                pendingResult.finish()
            }
        }
    }

    companion object {
        const val ACTION_COMPLETE_FOCUS = "com.focusgate.app.ACTION_COMPLETE_FOCUS"
        const val ACTION_PAUSE_FOCUS = "com.focusgate.app.ACTION_PAUSE_FOCUS"
    }
}
