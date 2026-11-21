package com.focusgate.app.policy

/**
 * Pure policy logic, independent of Android services so it can be unit-tested.
 *
 * The essential allowlist always wins. It covers telephony, messaging, system
 * UI, settings, package installation, the Play Store and Google Play services;
 * blocking any of these would break the phone itself.
 */
object PolicyEvaluator {

    private val ESSENTIAL_PACKAGES = setOf(
        "com.android.dialer",
        "com.android.incallui",
        "com.android.server.telecom",
        "com.android.mms",
        "com.android.messaging",
        "com.google.android.apps.messaging",
        "com.android.settings",
        "com.android.systemui",
        "com.android.permissioncontroller",
        "com.google.android.permissioncontroller",
        "com.android.packageinstaller",
        "com.google.android.packageinstaller",
        "com.android.vending",
        "com.google.android.gms",
        "com.android.camera",
        "com.android.camera2",
        "com.google.android.apps.maps",
        "com.android.emergency",
    )

    private val ESSENTIAL_PREFIXES = listOf(
        "com.android.dialer",
        "com.android.incallui",
        "com.android.server.telecom",
        "com.android.settings",
        "com.android.permissioncontroller",
        "com.google.android.permissioncontroller",
        "com.android.systemui",
    )

    private val SOCIAL_HINTS = listOf(
        "facebook", "instagram", "tiktok", "twitter", "x.com", "snapchat",
        "reddit", "discord", "telegram", "whatsapp", "pinterest", "linkedin",
    )
    private val VIDEO_HINTS = listOf("youtube", "netflix", "twitch", "prime", "disney", "hulu", "spotify")
    private val GAME_HINTS = listOf("game", "supercell", "king", "roblox", "minecraft", "pubg", "riot")

    fun isEssential(packageName: String): Boolean =
        packageName in ESSENTIAL_PACKAGES ||
            ESSENTIAL_PREFIXES.any { prefix ->
                packageName == prefix || packageName.startsWith("$prefix.")
            }

    /**
     * A package is effectively restricted only when it is selected, not
     * exempted, not essential, and no emergency window is active.
     */
    fun isBlocked(
        packageName: String,
        blockedPackages: Set<String>,
        exemptPackages: Set<String> = emptySet(),
        emergencyActive: Boolean = false,
        ownPackage: String? = null,
    ): Boolean {
        if (emergencyActive) return false
        if (ownPackage != null && packageName == ownPackage) return false
        return packageName in blockedPackages &&
            packageName !in exemptPackages &&
            !isEssential(packageName)
    }

    fun effectiveBlocked(
        blockedPackages: Set<String>,
        exemptPackages: Set<String>,
        ownPackage: String? = null,
    ): Set<String> = blockedPackages
        .filterNot { it in exemptPackages || isEssential(it) || it == ownPackage }
        .toSet()

    /** Best-effort category used for reporting; users can override it later. */
    fun categoryFor(packageName: String, label: String): String {
        val haystack = "$packageName $label".lowercase()
        return when {
            SOCIAL_HINTS.any { haystack.contains(it) } -> "social"
            VIDEO_HINTS.any { haystack.contains(it) } -> "video"
            GAME_HINTS.any { haystack.contains(it) } -> "games"
            else -> "other"
        }
    }
}
