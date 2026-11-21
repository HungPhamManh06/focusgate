package com.focusgate.app.data

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Aggregated foreground time per app. No window content, no keystrokes and no
 * per-screen data are recorded; only the package name and timestamps.
 */
@Entity(tableName = "usage_events", indices = [Index("startedAt")])
data class UsageEvent(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val packageName: String,
    val startedAt: Long,
    val endedAt: Long? = null,
    val blocked: Boolean = false,
)
