package com.focusgate.app.policy

/**
 * Pure overnight schedule evaluator for Bedtime Gate (e.g. 23:00 -> 06:30).
 * Unit-testable without Android framework dependencies.
 */
object BedtimeScheduleEvaluator {
    fun parseMinutes(hhmm: String?, fallbackMinutes: Int): Int {
        if (hhmm.isNullOrBlank()) return fallbackMinutes
        val parts = hhmm.trim().split(":")
        if (parts.size != 2) return fallbackMinutes
        val h = parts[0].toIntOrNull() ?: return fallbackMinutes
        val m = parts[1].toIntOrNull() ?: return fallbackMinutes
        if (h !in 0..23 || m !in 0..59) return fallbackMinutes
        return h * 60 + m
    }

    fun isInBedtimeWindow(
        nowMinutesOfDay: Int,
        startHhMm: String?,
        endHhMm: String?,
        enabled: Boolean,
    ): Boolean {
        if (!enabled) return false
        val normalizedNow = ((nowMinutesOfDay % 1440) + 1440) % 1440
        val start = parseMinutes(startHhMm, 23 * 60)
        val end = parseMinutes(endHhMm, 6 * 60 + 30)
        if (start == end) return false
        return if (start < end) {
            normalizedNow in start until end
        } else {
            normalizedNow >= start || normalizedNow < end
        }
    }
}
