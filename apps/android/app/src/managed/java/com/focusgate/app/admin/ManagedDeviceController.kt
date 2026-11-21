package com.focusgate.app.admin

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import com.focusgate.app.util.SystemPackages

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

    private val backend = object : ManagedSuspensionBackend {
        override fun isDeviceOwner(): Boolean =
            dpm?.isDeviceOwnerApp(appContext.packageName) == true

        override fun loadTrackedSuspended(): Set<String> =
            prefs().getStringSet(KEY_SUSPENDED, emptySet()).orEmpty().toSet()

        override fun saveTrackedSuspended(packages: Set<String>) {
            prefs().edit().putStringSet(KEY_SUSPENDED, packages.toSet()).apply()
        }

        override fun setPackagesSuspended(packages: Set<String>, suspended: Boolean): Set<String> {
            val manager = dpm ?: return packages
            return manager.setPackagesSuspended(
                admin,
                packages.toTypedArray(),
                suspended,
            ).orEmpty().toSet()
        }

        override fun querySuspensionState(packageName: String): PackageSuspensionState {
            val manager = dpm ?: return PackageSuspensionState.UNKNOWN
            if (!isDeviceOwner()) return PackageSuspensionState.UNKNOWN
            return try {
                if (manager.isPackageSuspended(admin, packageName)) {
                    PackageSuspensionState.SUSPENDED
                } else {
                    PackageSuspensionState.NOT_SUSPENDED
                }
            } catch (_: PackageManager.NameNotFoundException) {
                PackageSuspensionState.NOT_SUSPENDED
            } catch (_: SecurityException) {
                PackageSuspensionState.UNKNOWN
            } catch (_: Throwable) {
                PackageSuspensionState.UNKNOWN
            }
        }
    }

    fun isDeviceOwner(): Boolean = backend.isDeviceOwner()

    fun isAdminActive(): Boolean =
        dpm?.isAdminActive(admin) == true

    /**
     * Packages actually suspended by FocusGate, reconciled with
     * `DevicePolicyManager.isPackageSuspended` when the device is a Device Owner.
     */
    fun suspendedPackages(): Set<String> {
        val tracked = backend.loadTrackedSuspended()
        if (!isDeviceOwner()) return emptySet()
        return ManagedSuspensionReconciler.reconcileActualSuspended(
            tracked = tracked,
            candidates = emptySet(),
            backend = backend,
        )
    }

    fun applyBlockedPackages(
        blockedPackages: Set<String>,
        exemptPackages: Set<String>,
    ): ManagedApplyResult = ManagedSuspensionReconciler.applyBlockedPackages(
        blockedPackages = blockedPackages,
        exemptPackages = exemptPackages,
        ownPackage = appContext.packageName,
        deviceEssential = SystemPackages.deviceEssential(appContext),
        backend = backend,
    )

    fun clearSuspensions(): ManagedApplyResult =
        ManagedSuspensionReconciler.clearSuspensions(backend)

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
