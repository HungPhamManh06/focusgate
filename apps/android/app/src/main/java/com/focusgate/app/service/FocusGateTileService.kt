package com.focusgate.app.service

import android.content.Intent
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import androidx.core.content.ContextCompat
import com.focusgate.app.util.AgentPreferences
import com.focusgate.app.util.Notifications
import com.focusgate.app.util.PlanSyncManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * Android Quick Settings Tile:
 * 1-tap from notification shade to lock the Gate & start a 25-minute focus sprint
 * without opening the full app.
 */
class FocusGateTileService : TileService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onStartListening() {
        super.onStartListening()
        refreshTile()
    }

    override fun onClick() {
        super.onClick()
        val isFocusing = AgentPreferences.isActiveFocusRunning(this)
        if (!isFocusing) {
            // Enable gate protection + launch 25-min focus sprint
            AgentPreferences.setMonitorEnabled(this, true)
            AgentPreferences.setActiveFocusRunning(this, true)
            val endsAt = System.currentTimeMillis() + 25 * 60_000L
            AgentPreferences.setActiveFocusEndsAt(this, endsAt)
            ContextCompat.startForegroundService(
                this,
                Intent(this, AppUsageMonitorService::class.java),
            )
            Notifications.showLiveFocusNotification(
                context = this,
                taskTitle = "Focus Sprint (25m)",
                endsAtEpochMs = endsAt,
                isPaused = false,
            )
            scope.launch {
                runCatching { PlanSyncManager.startRemoteFocusSession(this@FocusGateTileService, 25) }
            }
        } else {
            // Stop local focus timer & cancel live notification
            val sessionId = AgentPreferences.getActiveFocusSessionId(this)
            AgentPreferences.setActiveFocusRunning(this, false)
            AgentPreferences.setActiveFocusEndsAt(this, 0L)
            Notifications.cancelLiveFocusNotification(this)
            if (!sessionId.isNullOrBlank()) {
                scope.launch {
                    runCatching {
                        PlanSyncManager.updateRemoteFocusSession(
                            this@FocusGateTileService,
                            action = "complete",
                            sessionId = sessionId,
                        )
                    }
                }
            }
        }
        refreshTile()
    }

    private fun refreshTile() {
        val tile = qsTile ?: return
        val focusing = AgentPreferences.isActiveFocusRunning(this)
        val locked = AgentPreferences.isMonitorEnabled(this) && !AgentPreferences.isPlanUnlocked(this)
        tile.state = when {
            focusing -> Tile.STATE_ACTIVE
            locked -> Tile.STATE_ACTIVE
            else -> Tile.STATE_INACTIVE
        }
        tile.label = if (focusing) "FocusGate · Focusing" else "FocusGate"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            tile.subtitle = when {
                focusing -> "25m Sprint Active"
                locked -> "Gate Locked"
                else -> "Tap for 25m Focus"
            }
        }
        tile.updateTile()
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }
}
