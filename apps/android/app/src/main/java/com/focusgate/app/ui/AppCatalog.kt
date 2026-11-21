package com.focusgate.app.ui

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import com.focusgate.app.policy.PolicyEvaluator
import com.focusgate.app.util.SystemPackages

data class InstalledApp(
    val packageName: String,
    val label: String,
    val essential: Boolean,
)

/**
 * Launcher apps only. No QUERY_ALL_PACKAGES permission is requested, so the
 * picker cannot enumerate hidden/system packages the user could not launch.
 */
fun loadLauncherApps(context: Context): List<InstalledApp> {
    val packageManager = context.packageManager
    val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)

    @Suppress("DEPRECATION")
    val resolved = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        packageManager.queryIntentActivities(intent, PackageManager.ResolveInfoFlags.of(0))
    } else {
        packageManager.queryIntentActivities(intent, 0)
    }

    val deviceEssential = SystemPackages.deviceEssential(context)
    return resolved
        .mapNotNull { it.activityInfo?.applicationInfo }
        .distinctBy { it.packageName }
        .filter { it.packageName != context.packageName }
        .map { info ->
            InstalledApp(
                packageName = info.packageName,
                label = runCatching {
                    packageManager.getApplicationLabel(info).toString()
                }.getOrDefault(info.packageName),
                essential = PolicyEvaluator.isEssential(info.packageName, deviceEssential),
            )
        }
        .filterNot { it.essential }
        .sortedBy { it.label.lowercase() }
}
