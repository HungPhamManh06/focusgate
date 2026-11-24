package com.focusgate.app.policy

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RemotePolicySyncTest {

    @Test
    fun `parsePolicyJson and toEffectiveBlockedPackages respect lockActive, allowlist, and essential packages`() {
        val json = """
            {
              "pulledAtUtc": "2026-11-22T09:00:00.000Z",
              "lockActive": true,
              "blockedProcesses": [
                "com.zhiliaoapp.musically",
                "com.instagram.android",
                "com.android.settings"
              ],
              "allowedProcesses": [
                "com.instagram.android"
              ]
            }
        """.trimIndent()

        val snapshot = RemotePolicySync.parsePolicyJson(json)
        assertTrue(snapshot.lockActive)
        assertEquals("2026-11-22T09:00:00.000Z", snapshot.pulledAtUtc)

        val effective = RemotePolicySync.toEffectiveBlockedPackages(snapshot)
        assertEquals(setOf("com.zhiliaoapp.musically"), effective)
    }

    @Test
    fun `toEffectiveBlockedPackages returns empty set when lockActive is false`() {
        val json = """
            {
              "pulledAtUtc": "2026-11-22T09:05:00.000Z",
              "lockActive": false,
              "blockedProcesses": ["com.zhiliaoapp.musically"],
              "allowedProcesses": []
            }
        """.trimIndent()

        val snapshot = RemotePolicySync.parsePolicyJson(json)
        assertFalse(snapshot.lockActive)
        assertEquals("en", snapshot.language)
        assertEquals(emptySet<String>(), RemotePolicySync.toEffectiveBlockedPackages(snapshot))
    }

    @Test
    fun `parsePolicyJson parses language field when present`() {
        val json = """
            {
              "pulledAtUtc": "2026-11-24T01:00:00.000Z",
              "lockActive": true,
              "blockedProcesses": [],
              "allowedProcesses": [],
              "language": "vi"
            }
        """.trimIndent()

        val snapshot = RemotePolicySync.parsePolicyJson(json)
        assertEquals("vi", snapshot.language)
    }
}
