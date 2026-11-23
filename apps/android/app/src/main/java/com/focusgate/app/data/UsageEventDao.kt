package com.focusgate.app.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query

@Dao
interface UsageEventDao {

    @Insert
    suspend fun insert(event: UsageEvent): Long

    @Query("UPDATE usage_events SET endedAt = :endedAt WHERE id = :id")
    suspend fun close(id: Long, endedAt: Long)

    @Query("SELECT * FROM usage_events ORDER BY startedAt DESC LIMIT :limit")
    suspend fun recent(limit: Int): List<UsageEvent>

    @Query("SELECT * FROM usage_events WHERE id > :afterId AND endedAt IS NOT NULL ORDER BY id ASC LIMIT :limit")
    suspend fun unsynced(afterId: Long, limit: Int): List<UsageEvent>
}
