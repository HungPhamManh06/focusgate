package com.focusgate.app.admin

import android.content.Context

class ManagedDeviceController(@Suppress("UNUSED_PARAMETER") context: Context) {

    fun isDeviceOwner(): Boolean = false

    fun isAdminActive(): Boolean = false

    fun suspendedPackages(): Set<String> = emptySet()

    fun auditPolicy(
        @Suppress("UNUSED_PARAMETER") blockedPackages: Set<String>,
        @Suppress("UNUSED_PARAMETER") exemptPackages: Set<String>,
    ): ManagedPolicyAudit = ManagedPolicyAudit(deviceOwnerValid = false)

    fun auditRequiredPackages(
        @Suppress("UNUSED_PARAMETER") requiredPackages: Set<String>,
    ): ManagedPolicyAudit = ManagedPolicyAudit(deviceOwnerValid = false)

    fun applyBlockedPackages(
        blockedPackages: Set<String>,
        exemptPackages: Set<String>,
    ): ManagedApplyResult = ManagedApplyResult(
        applied = false,
        suspendedPackages = 0,
        failures = emptyList(),
        message = "Managed Device mode is not included in the Personal build.",
    )

    fun clearSuspensions(): ManagedApplyResult = ManagedApplyResult(
        applied = false,
        suspendedPackages = 0,
        failures = emptyList(),
        message = "Managed Device mode is not included in the Personal build.",
    )

    fun configureLockTaskAllowlist(allowedPackages: Set<String>): Boolean = false

    fun clearLockTaskAllowlist() = Unit
}
