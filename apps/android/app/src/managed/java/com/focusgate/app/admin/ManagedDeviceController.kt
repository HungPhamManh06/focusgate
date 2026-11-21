package com.focusgate.app.admin

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import com.focusgate.app.policy.PolicyEvaluator

/**
 * Device Owner enforcement for Managed Device Mode.
 *
 * `setPackagesSuspended` hides selected apps from the launcher and prevents
 * them from being opened, which is real platform enforcement.
 * `setLockTaskPackages` is exposed for a dedicated-device/kiosk deployment,
 * but the normal app does not force kiosk mode.
 */
class ManagedDeviceController(context: Context) {

    private val appContext = context.applicationContext
    private val dpm = appContext.getSystemService(DevicePolicyManager::class.java)
    private val admin = ComponentName(appContext, FocusGateDeviceAdminReceiver::class.java)

    fun isDeviceOwner(): Boolean =
        dpm?.isDeviceOwnerApp(appContext.packageName) == true

    fun isAdminActive(): Boolean =
        dpm?.isAdminActive(admin) == true

    fun applyBlockedPackages(
        blockedPackages: Set<String>,
        exemptPackages: Set<String>,
    ): ManagedApplyResult {
        if (dpm == null || !isDeviceOwner()) {
            return ManagedApplyResult(
                applied = false,
                suspendedPackages = 0,
                failures = emptyList(),
                message = "Device Owner provisioning is required for managed enforcement.",
            )
        }

        val target = PolicyEvaluator.effectiveBlocked(
            blockedPackages = blockedPackages,
            exemptPackages = exemptPackages,
            ownPackage = appContext.packageName,
        )
        val currentlySuspended = prefs().getStringSet(KEY_SUSPENDED, emptySet()).orEmpty()
        val toUnsuspend = currentlySuspended - target
        val toSuspend = target - currentlySuspended
        val failures = mutableListOf<String>()

        return try {
            if (toUnsuspend.isNotEmpty()) {
                failures += dpm.setPackagesSuspended(
                    admin,
                    toUnsuspend.toTypedArray(),
                    false,
                ).orEmpty()
            }
            if (toSuspend.isNotEmpty()) {
                failures += dpm.setPackagesSuspended(
                    admin,
                    toSuspend.toTypedArray(),
                    true,
                ).orEmpty()
            }

            val next = buildSet {
                addAll(currentlySuspended - toUnsuspend)
                addAll(toSuspend - failures.toSet())
            }
            prefs().edit().putStringSet(KEY_SUSPENDED, next).apply()

            ManagedApplyResult(
                applied = failures.isEmpty(),
                suspendedPackages = next.size,
                failures = failures.distinct(),
                message = if (failures.isEmpty()) {
                    "Managed policy applied to ${next.size} app(s)."
                } else {
                    "${failures.size} app(s) could not be suspended."
                },
            )
        } catch (exception: SecurityException) {
            ManagedApplyResult(
                applied = false,
                suspendedPackages = currentlySuspended.size,
                failures = listOf(exception.message ?: "SecurityException"),
                message = "Managed policy was rejected by Android.",
            )
        }
    }

    fun clearSuspensions(): ManagedApplyResult {
        if (dpm == null || !isDeviceOwner()) {
            return ManagedApplyResult(false, 0, emptyList(), "Not a Device Owner.")
        }
        val currentlySuspended = prefs().getStringSet(KEY_SUSPENDED, emptySet()).orEmpty()
        if (currentlySuspended.isEmpty()) {
            return ManagedApplyResult(true, 0, emptyList(), "No managed suspensions to clear.")
        }

        return try {
            val failures = dpm.setPackagesSuspended(
                admin,
                currentlySuspended.toTypedArray(),
                false,
            ).orEmpty()
            val remaining = failures.toSet()
            prefs().edit().putStringSet(KEY_SUSPENDED, remaining).apply()
            ManagedApplyResult(
                applied = failures.isEmpty(),
                suspendedPackages = remaining.size,
                failures = failures,
                message = if (failures.isEmpty()) {
                    "All managed suspensions removed."
                } else {
                    "${failures.size} app(s) could not be resumed."
                },
            )
        } catch (exception: SecurityException) {
            ManagedApplyResult(
                applied = false,
                suspendedPackages = currentlySuspended.size,
                failures = listOf(exception.message ?: "SecurityException"),
                message = "Android rejected the request.",
            )
        }
    }

    /**
     * Optional dedicated-device kiosk configuration. The caller must also be in
     * the foreground to enter lock task mode; FocusGate does not enter it
     * automatically. Requires Device Owner.
     */
    fun configureLockTaskAllowlist(allowedPackages: Set<String>): Boolean {
        if (dpm == null || !isDeviceOwner()) return false
        return try {
            dpm.setLockTaskPackages(
                admin,
                (allowedPackages + appContext.packageName).toTypedArray(),
            )
            true
        } catch (_: SecurityException) {
            false
        }
    }

    fun clearLockTaskAllowlist() {
        if (dpm == null || !isDeviceOwner()) return
        runCatching { dpm.setLockTaskPackages(admin, emptyArray()) }
    }

    private fun prefs() =
        appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private companion object {
        const val PREFS = "focusgate_managed"
        const val KEY_SUSPENDED = "suspended_packages"
    }
}
