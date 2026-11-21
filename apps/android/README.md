# FocusGate Android

Kotlin/Jetpack Compose app-lock module. Two deployment flavours share the same
policy UI:

- **personal** (`com.focusgate.app`): Usage Access + a full-screen overlay.
- **managed** (`com.focusgate.app.managed`): Device Owner
  `setPackagesSuspended` for real platform enforcement on provisioned devices.

There is **no AccessibilityService**. Google Play limits the Accessibility API
to accessibility purposes, so FocusGate uses Usage Access to observe the
foreground app and a user-granted `TYPE_APPLICATION_OVERLAY` to present the
block screen. No `QUERY_ALL_PACKAGES`, no root, no exploit.

## Requirements

- JDK 17 (AGP 8.13 / Gradle 8.13 are not compatible with JDK 27).
- Android SDK Platform 36 and Build Tools 36.
- `local.properties` with `sdk.dir` (git-ignored) or `ANDROID_HOME`.

## Build and test

```bash
cd apps/android
./gradlew :app:assemblePersonalDebug :app:assembleManagedDebug \
  :app:testPersonalDebugUnitTest :app:testManagedDebugUnitTest
./gradlew :app:connectedPersonalDebugAndroidTest   # device/emulator required
```

APKs:

- `app/build/outputs/apk/personal/debug/app-personal-debug.apk`
- `app/build/outputs/apk/managed/debug/app-managed-debug.apk`

The Android 16 (API 36) emulator run and Milestone 1.2.1 unit test suite are
documented in [`../../docs/ANDROID_LOCK.md`](../../docs/ANDROID_LOCK.md) and
[`../../docs/MILESTONE1_2_1_TEST_REPORT.md`](../../docs/MILESTONE1_2_1_TEST_REPORT.md):
build, **60/60 unit tests per flavour** (`ManagedSuspensionReconcilerTest` 26,
`PolicyEvaluatorTest` 13, `ProtectionEvaluatorTest` 18, `EmergencyAccessTest` 3),
onboarding, block overlay, emergency access, permission revocation, reboot
restore, Device Owner suspension and managed reboot restore. Physical-device
testing (Redmi Note 13 / Android 15) has **not** been executed yet.

## Personal Strict Mode

1. Onboarding explains local usage monitoring and collects explicit consent.
2. The user grants **Usage Access** (foreground detection) and **Display over
   other apps** (block screen). Notifications are optional.
3. The user selects restricted apps and optionally exempt apps, then saves the
   policy and enables monitoring.
4. `AppUsageMonitorService` polls `UsageStatsManager.queryEvents` every second
   and adds a full-screen Compose overlay when a restricted package comes to the
   foreground.
5. Status is always derived from real state: `Protected`, `Degraded` (a required
   permission or the service is missing) or `Off`.

### Manual check

```bash
adb install -r app/build/outputs/apk/personal/debug/app-personal-debug.apk
adb shell appops set com.focusgate.app GET_USAGE_STATS allow
adb shell appops set com.focusgate.app SYSTEM_ALERT_WINDOW allow
adb shell pm grant com.focusgate.app android.permission.POST_NOTIFICATIONS
```

Then complete onboarding, restrict an app and open it. The overlay must appear
within about a second. Revoking Usage Access must hide the overlay, post a
"Protection lost" notification and change the status to `Degraded`.

## Managed Device mode

Only provision a device you control (typically factory-reset, no accounts):

```bash
adb install -r app/build/outputs/apk/managed/debug/app-managed-debug.apk
adb shell dpm set-device-owner \
  com.focusgate.app.managed/com.focusgate.app.admin.FocusGateDeviceAdminReceiver
```

Open the managed app, complete setup, select apps, and enable
**Apply Device Owner policy**. Android then refuses to launch the selected
packages and shows its own "Blocked by work policy" dialog. Emergency access
clears suspensions for 10 minutes; expiry or reboot re-applies them.

## Device test notes

- `TYPE_APPLICATION_OVERLAY` requires the user-granted overlay app-op.
- A reboot during emergency ends the pause by design (boot count check).
- The overlay is not touch-focusable; the home/recents keys still leave the
  blocked app, which is intended.
- Google Play: declare the `specialUse` foreground-service type and justify
  Usage Access/overlay in the listing. See the policy section in
  `docs/ANDROID_LOCK.md`.

## Known limits

FocusGate is a friction layer, not an uninstall-proof lock. The user can revoke
permissions, force-stop the app, use safe mode or a custom ROM. OEM
autostart/battery settings can stop the service; the status screen must show
that rather than claim protection. Physical-device testing is still required
before release.
