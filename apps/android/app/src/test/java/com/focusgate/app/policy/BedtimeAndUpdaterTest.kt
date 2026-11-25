package com.focusgate.app.policy

import com.focusgate.app.util.AppUpdater
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class BedtimeAndUpdaterTest {
    @Test
    fun overnightBedtimeWindowWrapsMidnight() {
        assertTrue(BedtimeScheduleEvaluator.isInBedtimeWindow(23 * 60 + 15, "23:00", "06:30", true))
        assertTrue(BedtimeScheduleEvaluator.isInBedtimeWindow(2 * 60, "23:00", "06:30", true))
        assertTrue(BedtimeScheduleEvaluator.isInBedtimeWindow(6 * 60 + 29, "23:00", "06:30", true))
        assertFalse(BedtimeScheduleEvaluator.isInBedtimeWindow(6 * 60 + 30, "23:00", "06:30", true))
        assertFalse(BedtimeScheduleEvaluator.isInBedtimeWindow(14 * 60, "23:00", "06:30", true))
        assertFalse(BedtimeScheduleEvaluator.isInBedtimeWindow(23 * 60 + 30, "23:00", "06:30", false))
    }

    @Test
    fun sameDayBedtimeWindowWorks() {
        assertTrue(BedtimeScheduleEvaluator.isInBedtimeWindow(13 * 60 + 30, "13:00", "14:00", true))
        assertFalse(BedtimeScheduleEvaluator.isInBedtimeWindow(14 * 60, "13:00", "14:00", true))
    }

    @Test
    fun parsesVersionCodeFromReleaseTag() {
        assertEquals(64, AppUpdater.parseVersionCodeFromTag("android-v0.1.64"))
        assertEquals(102, AppUpdater.parseVersionCodeFromTag("v0.1.102"))
        assertNull(AppUpdater.parseVersionCodeFromTag("release-latest"))
    }
}
