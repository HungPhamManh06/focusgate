package com.focusgate.app.admin

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ManagedSuspensionReconcilerTest {

    private val ownPkg = "com.focusgate.app.managed"
    private val youtube = "com.google.android.youtube"
    private val tiktok = "com.zhiliaoapp.musically"
    private val instagram = "com.instagram.android"

    private class FakeBackend(
        var deviceOwner: Boolean = true,
        initialTracked: Set<String> = emptySet(),
        initialOsSuspended: Set<String> = initialTracked,
        var failSuspend: Set<String> = emptySet(),
        var failUnsuspend: Set<String> = emptySet(),
        var throwSecurityExceptionOnSet: Boolean = false,
        var unknownStatePackages: Set<String> = emptySet(),
    ) : ManagedSuspensionBackend {
        var tracked: Set<String> = initialTracked.toSet()
        val osSuspended: MutableSet<String> = initialOsSuspended.toMutableSet()

        override fun isDeviceOwner(): Boolean = deviceOwner
        override fun loadTrackedSuspended(): Set<String> = tracked
        override fun saveTrackedSuspended(packages: Set<String>) {
            tracked = packages.toSet()
        }

        override fun setPackagesSuspended(packages: Set<String>, suspended: Boolean): Set<String> {
            if (throwSecurityExceptionOnSet) throw SecurityException("Device policy rejected")
            val failing = if (suspended) packages.intersect(failSuspend) else packages.intersect(failUnsuspend)
            val succeeded = packages - failing
            if (suspended) osSuspended.addAll(succeeded) else osSuspended.removeAll(succeeded)
            return failing
        }

        override fun querySuspensionState(packageName: String): PackageSuspensionState = when {
            packageName in unknownStatePackages -> PackageSuspensionState.UNKNOWN
            packageName in osSuspended -> PackageSuspensionState.SUSPENDED
            else -> PackageSuspensionState.NOT_SUSPENDED
        }
    }

    @Test
    fun `fails cleanly when not device owner`() {
        val backend = FakeBackend(deviceOwner = false)
        val result = ManagedSuspensionReconciler.applyBlockedPackages(
            blockedPackages = setOf(youtube),
            exemptPackages = emptySet(),
            ownPackage = ownPkg,
            deviceEssential = emptySet(),
            backend = backend,
        )
        assertFalse(result.applied)
        assertEquals(0, result.suspendedPackages)
        assertTrue(backend.tracked.isEmpty())
    }

    @Test
    fun `suspends all target packages on success`() {
        val backend = FakeBackend()
        val result = ManagedSuspensionReconciler.applyBlockedPackages(
            blockedPackages = setOf(youtube, tiktok),
            exemptPackages = emptySet(),
            ownPackage = ownPkg,
            deviceEssential = emptySet(),
            backend = backend,
        )
        assertTrue(result.applied)
        assertEquals(2, result.suspendedPackages)
        assertEquals(setOf(youtube, tiktok), backend.tracked)
        assertTrue(result.failedToSuspend.isEmpty())
        assertTrue(result.failedToUnsuspend.isEmpty())
    }

    @Test
    fun `failed suspend package is never recorded as suspended`() {
        val backend = FakeBackend(failSuspend = setOf(tiktok))
        val result = ManagedSuspensionReconciler.applyBlockedPackages(
            blockedPackages = setOf(youtube, tiktok),
            exemptPackages = emptySet(),
            ownPackage = ownPkg,
            deviceEssential = emptySet(),
            backend = backend,
        )
        assertFalse(result.applied)
        assertEquals(1, result.suspendedPackages)
        assertEquals(setOf(youtube), backend.tracked)
        assertEquals(listOf(tiktok), result.failedToSuspend)
        assertTrue(result.failedToUnsuspend.isEmpty())
    }

    @Test
    fun `failed unsuspend package remains tracked as suspended`() {
        val backend = FakeBackend(
            initialTracked = setOf(youtube, tiktok),
            failUnsuspend = setOf(youtube),
        )
        val result = ManagedSuspensionReconciler.applyBlockedPackages(
            blockedPackages = setOf(tiktok),
            exemptPackages = emptySet(),
            ownPackage = ownPkg,
            deviceEssential = emptySet(),
            backend = backend,
        )
        assertFalse(result.applied)
        assertEquals(2, result.suspendedPackages)
        assertEquals(setOf(youtube, tiktok), backend.tracked)
        assertTrue(result.failedToSuspend.isEmpty())
        assertEquals(listOf(youtube), result.failedToUnsuspend)
    }

    @Test
    fun `separates suspend and unsuspend failures accurately`() {
        val backend = FakeBackend(
            initialTracked = setOf(youtube),
            failUnsuspend = setOf(youtube),
            failSuspend = setOf(tiktok),
        )
        val result = ManagedSuspensionReconciler.applyBlockedPackages(
            blockedPackages = setOf(tiktok, instagram),
            exemptPackages = emptySet(),
            ownPackage = ownPkg,
            deviceEssential = emptySet(),
            backend = backend,
        )
        assertFalse(result.applied)
        assertEquals(setOf(youtube, instagram), backend.tracked)
        assertEquals(listOf(tiktok), result.failedToSuspend)
        assertEquals(listOf(youtube), result.failedToUnsuspend)
        assertEquals(listOf(youtube, tiktok).sorted(), result.failures)
    }

    @Test
    fun `SecurityException during apply preserves tracked suspended state`() {
        val backend = FakeBackend(
            initialTracked = setOf(youtube),
            throwSecurityExceptionOnSet = true,
        )
        val result = ManagedSuspensionReconciler.applyBlockedPackages(
            blockedPackages = setOf(tiktok),
            exemptPackages = emptySet(),
            ownPackage = ownPkg,
            deviceEssential = emptySet(),
            backend = backend,
        )
        assertFalse(result.applied)
        assertEquals(setOf(youtube), backend.tracked)
        assertEquals(1, result.suspendedPackages)
    }

    @Test
    fun `clearSuspensions retains packages that fail to unsuspend and recovers on retry`() {
        val backend = FakeBackend(
            initialTracked = setOf(youtube, tiktok),
            failUnsuspend = setOf(youtube),
        )
        val first = ManagedSuspensionReconciler.clearSuspensions(backend)
        assertFalse(first.applied)
        assertEquals(setOf(youtube), backend.tracked)
        assertEquals(listOf(youtube), first.failedToUnsuspend)

        // Retry after transient failure resolves.
        backend.failUnsuspend = emptySet()
        val retry = ManagedSuspensionReconciler.clearSuspensions(backend)
        assertTrue(retry.applied)
        assertTrue(backend.tracked.isEmpty())
        assertEquals(0, retry.suspendedPackages)
    }

    @Test
    fun `clearSuspensions handles SecurityException without losing tracked packages`() {
        val backend = FakeBackend(
            initialTracked = setOf(youtube),
            throwSecurityExceptionOnSet = true,
        )
        val result = ManagedSuspensionReconciler.clearSuspensions(backend)
        assertFalse(result.applied)
        assertEquals(setOf(youtube), backend.tracked)
    }

    @Test
    fun `reconciles actual OS state when package was externally unsuspended`() {
        val backend = FakeBackend(
            initialTracked = setOf(youtube, tiktok),
            initialOsSuspended = setOf(tiktok),
        )
        val result = ManagedSuspensionReconciler.applyBlockedPackages(
            blockedPackages = setOf(youtube, tiktok),
            exemptPackages = emptySet(),
            ownPackage = ownPkg,
            deviceEssential = emptySet(),
            backend = backend,
        )
        assertTrue(result.applied)
        assertEquals(setOf(youtube, tiktok), backend.tracked)
        assertEquals(setOf(youtube, tiktok), backend.osSuspended)
    }

    @Test
    fun `never suspends own package, exempt apps, or essential apps`() {
        val backend = FakeBackend()
        val result = ManagedSuspensionReconciler.applyBlockedPackages(
            blockedPackages = setOf(ownPkg, youtube, tiktok, "com.android.settings", "com.oem.launcher"),
            exemptPackages = setOf(tiktok),
            ownPackage = ownPkg,
            deviceEssential = setOf("com.oem.launcher"),
            backend = backend,
        )
        assertTrue(result.applied)
        assertEquals(setOf(youtube), backend.tracked)
    }
}
