package com.focusgate.app.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query

@Dao
interface PendingSyncDao {
    @Insert
    suspend fun enqueue(action: PendingSyncAction): Long

    @Query("SELECT * FROM pending_sync_actions ORDER BY id ASC LIMIT 50")
    suspend fun getPending(): List<PendingSyncAction>

    @Query("DELETE FROM pending_sync_actions WHERE id = :id")
    suspend fun deleteById(id: Long)

    @Query("UPDATE pending_sync_actions SET retry_count = retry_count + 1 WHERE id = :id")
    suspend fun incrementRetry(id: Long)

    @Query("SELECT COUNT(*) FROM pending_sync_actions")
    suspend fun pendingCount(): Int
}
