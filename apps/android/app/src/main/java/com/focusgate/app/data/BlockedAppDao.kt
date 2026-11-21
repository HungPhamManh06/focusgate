package com.focusgate.app.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import kotlinx.coroutines.flow.Flow

@Dao
interface BlockedAppDao {

    @Query("SELECT * FROM blocked_apps ORDER BY label COLLATE NOCASE")
    fun observeAll(): Flow<List<BlockedApp>>

    @Query("SELECT packageName FROM blocked_apps WHERE enabled = 1 AND is_exempt = 0")
    fun observeBlockedPackages(): Flow<List<String>>

    @Query("SELECT packageName FROM blocked_apps WHERE enabled = 1 AND is_exempt = 1")
    fun observeExemptPackages(): Flow<List<String>>

    @Query("SELECT packageName FROM blocked_apps WHERE enabled = 1 AND is_exempt = 0")
    suspend fun blockedPackages(): List<String>

    @Query("SELECT packageName FROM blocked_apps WHERE enabled = 1 AND is_exempt = 1")
    suspend fun exemptPackages(): List<String>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(apps: List<BlockedApp>)

    @Query("DELETE FROM blocked_apps")
    suspend fun clear()

    @Query("DELETE FROM blocked_apps WHERE packageName NOT IN (:packages)")
    suspend fun deleteMissing(packages: List<String>)

    /** Replaces the whole rule set in one transaction so services never see a half-written policy. */
    @Transaction
    suspend fun replaceAll(apps: List<BlockedApp>) {
        clear()
        if (apps.isNotEmpty()) upsert(apps)
    }
}
