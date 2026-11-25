package com.focusgate.app.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [BlockedApp::class, UsageEvent::class, PendingSyncAction::class],
    version = 3,
    exportSchema = false,
)
abstract class FocusGateDatabase : RoomDatabase() {

    abstract fun blockedAppDao(): BlockedAppDao
    abstract fun usageEventDao(): UsageEventDao
    abstract fun pendingSyncDao(): PendingSyncDao

    companion object {
        /** PoC installs already have blocked_apps; preserve them as restricted rules. */
        private val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    "ALTER TABLE blocked_apps ADD COLUMN is_exempt INTEGER NOT NULL DEFAULT 0",
                )
            }
        }

        private val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS pending_sync_actions (
                        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                        action_type TEXT NOT NULL,
                        payload_json TEXT NOT NULL,
                        created_at INTEGER NOT NULL,
                        retry_count INTEGER NOT NULL DEFAULT 0
                    )
                    """.trimIndent(),
                )
            }
        }

        @Volatile
        private var instance: FocusGateDatabase? = null

        fun get(context: Context): FocusGateDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    context.applicationContext,
                    FocusGateDatabase::class.java,
                    "focusgate.db",
                )
                    .addMigrations(MIGRATION_1_2, MIGRATION_2_3)
                    .build()
                    .also { instance = it }
            }
    }
}
