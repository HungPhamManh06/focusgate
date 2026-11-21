package com.focusgate.app.util

import org.junit.Assert.assertEquals
import org.junit.Test

class EmergencyAccessTest {

    @Test
    fun `remaining time is positive inside the window`() {
        assertEquals(
            60_000L,
            EmergencyAccess.remainingMillis(
                nowElapsed = 1_000L,
                untilElapsed = 61_000L,
                bootMatches = true,
            ),
        )
    }

    @Test
    fun `expired window is zero`() {
        assertEquals(
            0L,
            EmergencyAccess.remainingMillis(
                nowElapsed = 62_000L,
                untilElapsed = 61_000L,
                bootMatches = true,
            ),
        )
    }

    @Test
    fun `reboot invalidates the window`() {
        assertEquals(
            0L,
            EmergencyAccess.remainingMillis(
                nowElapsed = 1_000L,
                untilElapsed = 61_000L,
                bootMatches = false,
            ),
        )
    }
}
