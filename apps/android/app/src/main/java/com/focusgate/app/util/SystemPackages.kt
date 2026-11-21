package com.focusgate.app.util

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Telephony
import android.telecom.TelecomManager

/**
 * Packages that must never be restricted on this particular device: the
 * current launcher, the default dialer and the default SMS app. OEM builds
 * (e.g. Xiaomi HyperOS, Samsung One UI) use their own package names, so these
 * are resolved at runtime and combined with the static essential list in
 * `PolicyEvaluator`. No permission is required for any of these lookups.
 */
object SystemPackages {

    fun deviceEssential(context: Context): Set<String> = buildSet {
        defaultHome(context)?.let(::add)
        defaultDialer(context)?.let(::add)
        defaultSms(context)?.let(::add)
    }

    private fun defaultHome(context: Context): String? = runCatching {
        val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
        val info = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.packageManager.resolveActivity(
                intent,
                PackageManager.ResolveInfoFlags.of(PackageManager.MATCH_DEFAULT_ONLY.toLong()),
            )
        } else {
            @Suppress("DEPRECATION")
            context.packageManager.resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY)
        }
        // "android" is the chooser when no default launcher is set.
        info?.activityInfo?.packageName?.takeIf { it != "android" }
    }.getOrNull()

    private fun defaultDialer(context: Context): String? = runCatching {
        context.getSystemService(TelecomManager::class.java)?.defaultDialerPackage
    }.getOrNull()

    private fun defaultSms(context: Context): String? = runCatching {
        Telephony.Sms.getDefaultSmsPackage(context)
    }.getOrNull()
}
