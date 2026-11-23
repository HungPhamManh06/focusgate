package com.focusgate.app.util

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.time.TimeRangeFilter
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
    val PERMISSIONS: Set<String> = setOf(
        HealthPermission.getReadPermission(StepsRecord::class),
        HealthPermission.getReadPermission(SleepSessionRecord::class),
        HealthPermission.getReadPermission(HeartRateRecord::class),
        HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class),
    )

    fun isAvailable(context: Context): Boolean =
        HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE

    suspend fun hasAllPermissions(context: Context): Boolean {
        if (!isAvailable(context)) return false
        val client = HealthConnectClient.getOrCreate(context)
        val granted = client.permissionController.getGrantedPermissions()
        return granted.containsAll(PERMISSIONS)
    }

    suspend fun readLast7Days(context: Context): List<DailyHealthMetricUpload> {
        if (!hasAllPermissions(context)) return emptyList()
        val client = HealthConnectClient.getOrCreate(context)
        val zone = ZoneId.systemDefault()
        val today = LocalDate.now(zone)
        val results = mutableListOf<DailyHealthMetricUpload>()

        for (offset in 0L..6L) {
            val day = today.minusDays(offset)
            val start = day.atStartOfDay(zone).toInstant()
            val end = day.plusDays(1).atStartOfDay(zone).toInstant()

            val agg = client.aggregate(
                AggregateRequest(
                    metrics = setOf(
                        StepsRecord.COUNT_TOTAL,
                        SleepSessionRecord.SLEEP_DURATION_TOTAL,
                        HeartRateRecord.BPM_AVG,
                        ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL,
                    ),
                    timeRangeFilter = TimeRangeFilter.between(start, end),
                ),
            )

            val steps = (agg[StepsRecord.COUNT_TOTAL] ?: 0L).toInt()
            val sleepMinutes = ((agg[SleepSessionRecord.SLEEP_DURATION_TOTAL]?.toMinutes()) ?: 0L).toInt()
            val avgHr = agg[HeartRateRecord.BPM_AVG]?.toInt()
            val calories = (agg[ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL]?.inKilocalories ?: 0.0).toInt()

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
