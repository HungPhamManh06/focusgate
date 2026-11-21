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

    @Test
    fun `OEM dialer, contacts and security apps are essential`() {
        listOf(
            "com.google.android.dialer",
            "com.google.android.contacts",
            "com.android.phone",
            "com.miui.securitycenter",
            "com.miui.home",
            "com.samsung.android.dialer",
            "com.google.android.apps.safetyhub",
        ).forEach { pkg ->
            assertTrue("$pkg should be essential", PolicyEvaluator.isEssential(pkg))
            assertFalse("$pkg must never be blocked", PolicyEvaluator.isBlocked(pkg, setOf(pkg)))
        }
    }

    @Test
    fun `device default launcher, dialer and SMS app are never blocked`() {
        val oemDialer = "com.example.oem.dialer"
        val oemLauncher = "com.example.oem.launcher"
        val deviceEssential = setOf(oemDialer, oemLauncher)

        assertFalse(
            PolicyEvaluator.isBlocked(
                packageName = oemDialer,
                blockedPackages = setOf(oemDialer, facebook),
                deviceEssential = deviceEssential,
            ),
        )
        val effective = PolicyEvaluator.effectiveBlocked(
            blockedPackages = setOf(oemDialer, oemLauncher, facebook),
            exemptPackages = emptySet(),
            deviceEssential = deviceEssential,
        )
        assertTrue(effective == setOf(facebook))
    }

    @Test
    fun `ordinary entertainment apps are not treated as essential`() {
        listOf(facebook, youtube, "com.zhiliaoapp.musically", "com.instagram.android").forEach {
            assertFalse("$it should not be essential", PolicyEvaluator.isEssential(it))
        }
    }

    @Test
    fun `system UI, permission controller, and emergency apps are always protected`() {
        listOf(
            "com.android.systemui",
            "com.android.permissioncontroller",
            "com.google.android.permissioncontroller",
            "com.android.emergency",
            "com.android.cellbroadcastreceiver",
            "com.google.android.cellbroadcastreceiver",
        ).forEach { pkg ->
            assertTrue("$pkg must be essential", PolicyEvaluator.isEssential(pkg))
            assertFalse("$pkg must never be blocked", PolicyEvaluator.isBlocked(pkg, setOf(pkg)))
        }
    }

    @Test
    fun `changing default SMS, dialer, or launcher updates essential protection`() {
        val oldSms = "com.example.sms.old"
        val newSms = "com.example.sms.new"

        assertFalse(
            PolicyEvaluator.isBlocked(
                packageName = oldSms,
                blockedPackages = setOf(oldSms, newSms),
                deviceEssential = setOf(oldSms),
            ),
        )
        assertTrue(
            PolicyEvaluator.isBlocked(
                packageName = newSms,
                blockedPackages = setOf(oldSms, newSms),
                deviceEssential = setOf(oldSms),
            ),
        )
        // After user switches default SMS to newSms:
        assertFalse(
            PolicyEvaluator.isBlocked(
                packageName = newSms,
                blockedPackages = setOf(oldSms, newSms),
                deviceEssential = setOf(newSms),
            ),
        )
    }

    @Test
    fun `blank or malformed entries in policy are ignored and never block`() {
        val effective = PolicyEvaluator.effectiveBlocked(
            blockedPackages = setOf("", "   ", facebook),
            exemptPackages = emptySet(),
        )
        assertTrue(effective == setOf(facebook))
        assertFalse(PolicyEvaluator.isBlocked("", setOf("", facebook)))
        assertFalse(PolicyEvaluator.isBlocked("   ", setOf("   ", facebook)))
    }
}
