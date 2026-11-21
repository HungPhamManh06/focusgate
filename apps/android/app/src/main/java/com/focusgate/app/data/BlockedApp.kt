package com.focusgate.app.data

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * A user-selected app rule. Only the package name, label and category are
 * stored; FocusGate never reads app content.
 *
 * A package can be either restricted or exempt, never both. The UI enforces
 * that mutual exclusivity and the effective policy subtracts exemptions.
 */
@Entity(tableName = "blocked_apps")
data class BlockedApp(
    @PrimaryKey val packageName: String,
    val label: String,
    val category: String,
    val enabled: Boolean = true,
    @ColumnInfo(name = "is_exempt") val isExempt: Boolean = false,
)
