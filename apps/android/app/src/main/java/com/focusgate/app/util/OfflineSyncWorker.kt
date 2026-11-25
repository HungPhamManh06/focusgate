package com.focusgate.app.util

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.focusgate.app.data.FocusGateDatabase
import com.focusgate.app.data.PendingSyncAction
import org.json.JSONObject

/**
 * Offline-First Sync Worker:
 * Queues task completions & quick-adds locally when offline and flushes them
 * in FIFO order automatically as soon as Android regains network connectivity.
 */
class OfflineSyncWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val dao = FocusGateDatabase.get(applicationContext).pendingSyncDao()
        val items = dao.getPending()
        if (items.isEmpty()) return Result.success()

        var hadTransientFailure = false
        for (item in items) {
            if (item.retryCount >= MAX_RETRIES) {
                dao.deleteById(item.id)
                continue
            }
            val ok = runCatching {
                val json = JSONObject(item.payloadJson)
                when (item.actionType) {
                    TYPE_COMPLETE_TASK -> {
                        val planTaskId = json.optString("planTaskId", "")
                        if (planTaskId.isNotBlank()) {
                            PlanSyncManager.completeTaskAndSync(applicationContext, planTaskId)
                        }
                    }
                    TYPE_CREATE_TASK -> {
                        val title = json.optString("title", "")
                        if (title.isNotBlank()) {
                            PlanSyncManager.createTaskAndSync(
                                context = applicationContext,
                                title = title,
                                kind = json.optString("kind", "must_do"),
                                requiredFocusMinutes = json.optInt("requiredFocusMinutes", 25),
                                addToTodayPlan = json.optBoolean("addToTodayPlan", true),
                            )
                        }
                    }
                    TYPE_START_FOCUS -> {
                        PlanSyncManager.startRemoteFocusSession(
                            applicationContext,
                            json.optInt("plannedMinutes", 25),
                        )
                    }
                }
            }.isSuccess

            if (ok) {
                dao.deleteById(item.id)
            } else {
                dao.incrementRetry(item.id)
                hadTransientFailure = true
            }
        }
        return if (hadTransientFailure) Result.retry() else Result.success()
    }

    companion object {
        const val TYPE_COMPLETE_TASK = "complete_task"
        const val TYPE_CREATE_TASK = "create_task"
        const val TYPE_START_FOCUS = "start_focus"
        private const val WORK_NAME = "focusgate_offline_sync"
        private const val MAX_RETRIES = 6

        suspend fun enqueueAction(context: Context, actionType: String, payload: JSONObject) {
            FocusGateDatabase.get(context).pendingSyncDao().enqueue(
                PendingSyncAction(
                    actionType = actionType,
                    payloadJson = payload.toString(),
                ),
            )
            scheduleFlush(context)
        }

        fun scheduleFlush(context: Context) {
            val request = OneTimeWorkRequestBuilder<OfflineSyncWorker>()
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build(),
                )
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork(
                WORK_NAME,
                ExistingWorkPolicy.REPLACE,
                request,
            )
        }
    }
}
