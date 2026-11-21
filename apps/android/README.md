# FocusGate Android – Phase 0 PoC

A minimal, honest proof of concept for the two Android mechanisms FocusGate
needs: **usage monitoring** and **a block screen**. It is not the production
app (no auth, no sync, no reward wallet yet).

## What it does

1. Lists launchable apps (`<queries>` visibility only — no `QUERY_ALL_PACKAGES`).
2. Saves a user-selected block list in Room.
3. Runs a foreground service that polls `UsageStatsManager` every 5 s and stores
   aggregated foreground time locally.
4. Runs an `AccessibilityService` that observes **only**
   `TYPE_WINDOW_STATE_CHANGED` package names (`canRetrieveWindowContent="false"`).
5. Shows a full-screen block screen when a selected app becomes active.
6. Restarts monitoring after boot and warns when accessibility was revoked.

## Build

Requirements:

- Android Studio (Ladybug or newer) with JDK 17–21. The Gradle/AGP versions in
  this project are **not** compatible with JDK 27, which is what is installed on
  the machine where this PoC was authored.
- Android SDK Platform 35 and Build Tools 35.

```bash
cd apps/android
# Open in Android Studio, or with a configured ANDROID_HOME:
./gradlew :app:assembleDebug
```

> On the development machine used for Phase 0 there was **no Android SDK**, so
> this module has not been compiled here. That is a reported limitation, not a
> claim of success. The Windows PoC and the database were executed and verified.

## Manual test script

1. Install the debug APK.
2. Grant **Usage access** (Settings → Special app access → Usage access).
3. Enable **FocusGate app blocking** in Accessibility settings.
4. Start monitoring in the app, select one entertainment app, save.
5. Open the blocked app → the FocusGate block screen must appear within ~1 s.
6. Force-stop the entertainment app → it must remain blocked next launch.
7. Disable accessibility → the app must show "Not granted" and the notification
   must warn that protection is off.
8. Reboot → monitoring resumes and the block screen still applies.
9. Revoke usage access → monitoring must show inactive; it must not pretend to
   protect the device.

## Known platform limits

- UsageStatsManager observes, it does not enforce. Enforcement here is the
  accessibility-window trigger plus an activity launch.
- Android 10+ restricts background activity launches. On vendor builds that
  refuse the launch, switch the presentation to an accessibility overlay
  (`TYPE_ACCESSIBILITY_OVERLAY`) or a full-screen notification. See
  `docs/ANDROID_LOCK.md`.
- Accessibility can be revoked by the user; this is by design in Personal Strict
  Mode. Managed Device Mode requires Device Owner provisioning.
- Battery optimisation on some OEM builds may stop the foreground service. The
  ongoing notification and the in-app status make that visible.
