package com.focusgate.app.util

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.aggregate.AggregateMetric
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import java.time.Duration
import java.time.LocalDate
import java.time.ZoneId

data class DailyHealthMetricUpload(
    val date: String,
    val steps: Int,
    val sleepMinutes: Int,
    val avgHeartRate: Int?,
    val activeCalories: Int,
)

object HealthConnectSync {
    private val STEPS_PERM = HealthPermission.getReadPermission(StepsRecord::class)
    private val SLEEP_PERM = HealthPermission.getReadPermission(SleepSessionRecord::class)
    private val HR_PERM = HealthPermission.getReadPermission(HeartRateRecord::class)
    private val CAL_PERM = HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class)

    val PERMISSIONS: Set<String> = setOf(STEPS_PERM, SLEEP_PERM, HR_PERM, CAL_PERM)

    fun isAvailable(context: Context): Boolean =
        HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE

    suspend fun hasAnyPermission(context: Context): Boolean {
        if (!isAvailable(context)) return false
        val client = HealthConnectClient.getOrCreate(context)
        val granted = client.permissionController.getGrantedPermissions()
        return PERMISSIONS.any { it in granted }
    }

    suspend fun readLast7Days(context: Context): List<DailyHealthMetricUpload> {
        if (!isAvailable(context)) return emptyList()
        val client = HealthConnectClient.getOrCreate(context)
        val granted = client.permissionController.getGrantedPermissions()

        val metrics = mutableSetOf<AggregateMetric<*>>()
        if (STEPS_PERM in granted) metrics.add(StepsRecord.COUNT_TOTAL)
        if (SLEEP_PERM in granted) metrics.add(SleepSessionRecord.SLEEP_DURATION_TOTAL)
        if (HR_PERM in granted) metrics.add(HeartRateRecord.BPM_AVG)
        if (CAL_PERM in granted) metrics.add(ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL)
        if (metrics.isEmpty()) return emptyList()

        val zone = ZoneId.systemDefault()
        val today = LocalDate.now(zone)
        val results = mutableListOf<DailyHealthMetricUpload>()

        for (offset in 0L..6L) {
            val day = today.minusDays(offset)
            val start = day.atStartOfDay(zone).toInstant()
            val end = day.plusDays(1).atStartOfDay(zone).toInstant()
            val range = TimeRangeFilter.between(start, end)

            val agg = client.aggregate(AggregateRequest(metrics = metrics, timeRangeFilter = range))

            var steps = if (STEPS_PERM in granted) (agg[StepsRecord.COUNT_TOTAL] ?: 0L).toInt() else 0
            if (steps == 0 && STEPS_PERM in granted) {
                val rawSteps = client.readRecords(ReadRecordsRequest(StepsRecord::class, timeRangeFilter = range))
                steps = rawSteps.records.sumOf { it.count }.toInt()
            }

            var sleepMinutes = if (SLEEP_PERM in granted) {
                ((agg[SleepSessionRecord.SLEEP_DURATION_TOTAL]?.toMinutes()) ?: 0L).toInt()
            } else {
                0
            }
            if (sleepMinutes == 0 && SLEEP_PERM in granted) {
                val rawSleep = client.readRecords(ReadRecordsRequest(SleepSessionRecord::class, timeRangeFilter = range))
                sleepMinutes = rawSleep.records.sumOf {
                    Duration.between(it.startTime, it.endTime).toMinutes().coerceAtLeast(0L)
                }.toInt()
            }

            val avgHr = if (HR_PERM in granted) agg[HeartRateRecord.BPM_AVG]?.toInt() else null
            val calories = if (CAL_PERM in granted) {
                (agg[ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL]?.inKilocalories ?: 0.0).toInt()
            } else {
                0
            }

            if (steps > 0 || sleepMinutes > 0 || avgHr != null || calories > 0) {
                results.add(
                    DailyHealthMetricUpload(
                        date = day.toString(),
                        steps = steps,
                        sleepMinutes = sleepMinutes,
                        avgHeartRate = avgHr,
                        activeCalories = calories,
                    ),
                )
            }
        }
        return results
    }
}
