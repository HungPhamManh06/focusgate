package com.focusgate.app.policy

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PolicyEvaluatorTest {

    private val facebook = "com.facebook.katana"
    private val youtube = "com.google.android.youtube"

    @Test
    fun `selected app is blocked`() {
        assertTrue(PolicyEvaluator.isBlocked(facebook, setOf(facebook)))
    }

    @Test
    fun `unselected app is not blocked`() {
        assertFalse(PolicyEvaluator.isBlocked(youtube, setOf(facebook)))
    }

    @Test
    fun `exemption wins over restriction`() {
        assertFalse(
            PolicyEvaluator.isBlocked(
                packageName = facebook,
                blockedPackages = setOf(facebook),
                exemptPackages = setOf(facebook),
            ),
        )
    }

    @Test
    fun `essential app is never blocked`() {
        assertTrue(PolicyEvaluator.isEssential("com.android.settings"))
        assertFalse(PolicyEvaluator.isBlocked("com.android.settings", setOf("com.android.settings")))
    }

    @Test
    fun `emergency access bypasses restrictions`() {
        assertFalse(
            PolicyEvaluator.isBlocked(
                packageName = facebook,
                blockedPackages = setOf(facebook),
                emergencyActive = true,
            ),
        )
    }

    @Test
    fun `own package is never blocked`() {
        assertFalse(
            PolicyEvaluator.isBlocked(
                packageName = "com.focusgate.app",
                blockedPackages = setOf("com.focusgate.app"),
                ownPackage = "com.focusgate.app",
            ),
        )
    }

    @Test
    fun `effective blocked removes exemptions and essentials`() {
        val effective = PolicyEvaluator.effectiveBlocked(
            blockedPackages = setOf(facebook, youtube, "com.android.settings"),
            exemptPackages = setOf(youtube),
        )
        assertTrue(facebook in effective)
        assertFalse(youtube in effective)
        assertFalse("com.android.settings" in effective)
    }
}
