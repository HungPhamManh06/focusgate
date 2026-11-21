# Android App Lock

Status: **implemented, compiled, unit-tested and exercised on an Android 16
(API 36) emulator** on 2026-11-22. Physical-device/OEM testing is still
required before release. Nothing here is root, an exploit, or an
uninstall-proof claim.

## 1. What Android actually allows

| Mechanism | What it can do | What it cannot do |
|---|---|---|
| `UsageStatsManager` (`PACKAGE_USAGE_STATS`) | Read foreground/background events and aggregate usage; detect which package is in front | Block anything. It is telemetry behind a user-granted special access. |
| `SYSTEM_ALERT_WINDOW` overlay | Draw the block screen over another app after a separate user grant | Intercept secure windows; survive revocation. |
| Foreground service (`specialUse`) | Keep monitoring alive with an ongoing notification | Guarantee survival against force-stop, safe mode or aggressive OEM battery managers. |
| `DevicePolicyManager` as **Device Owner** | `setPackagesSuspended` (real suspension), `setLockTaskPackages`, `setUninstallBlocked` | Work without device-owner/DPC provisioning. On a personal phone the user remains in control. |
| Accessibility service | Observe window changes | **Not used.** Google Play limits the Accessibility API to accessibility purposes; an ordinary app blocker does not qualify. |

**Conclusion:** Personal Strict Mode is friction, not an inviolable lock.
Managed Device Mode is the only path to enforcement by platform policy, and it
requires legitimate device-owner provisioning (EMM/DPC, usually a
factory-reset device). FocusGate never attempts to become Device Owner by
itself.

## 2. Personal Strict Mode architecture

```
UsageStatsManager ──poll 1 s──► AppUsageMonitorService ──Room──► usage_events
                                        │
                                        ├─ PolicyEvaluator (restricted/exempt/emergency)
                                        │
                                        └─ BlockOverlayController
                                             ComposeView in TYPE_APPLICATION_OVERLAY
BootReceiver ──BOOT_COMPLETED──► restore monitoring / managed policy
EmergencyExpiryReceiver ──alarm──► re-apply policy after emergency access
```

Key files:

- `service/AppUsageMonitorService.kt` – foreground service, polls
  `queryEvents`, records usage, shows/hides the overlay, reports revoked
  permissions, and handles emergency access.
- `service/BlockOverlayController.kt` – full-screen `ComposeView` added through
  `WindowManager` as `TYPE_APPLICATION_OVERLAY` (`FLAG_NOT_FOCUSABLE`), removed
  when the restricted app leaves the foreground.
- `ui/BlockOverlayContent.kt` – the block screen, including the emergency
  confirmation.
- `ui/OnboardingScreen.kt` – privacy disclosure and the Usage Access / overlay
  / notification steps.
- `ui/HomeScreen.kt` – real protection status, permission state, monitoring
  switch, emergency access, restricted/exempt lists, save policy, managed mode.
- `policy/PolicyEvaluator.kt` – pure decision logic with an essential allowlist
  (dialer, messaging, system UI, settings, installer, Play services, camera,
  emergency, FocusGate itself).
- `policy/ProtectionEvaluator.kt` – Protected / Degraded / Off, derived from
  real permission and service state; the UI never claims protection when a
  required capability is missing.
- `util/EmergencyAccess.kt` – bounded pause using `elapsedRealtime` plus the
  system boot count.
- `service/BootReceiver.kt` – restores monitoring or managed policy after boot
  and app updates, and warns if a permission is missing.

No `QUERY_ALL_PACKAGES`: package visibility is limited to launcher activities,
which is exactly the set a user can choose. No Accessibility service and no
background activity launch. Only package names, labels, categories and
timestamps are stored locally in Room.

## 3. Managed Device Mode (Device Owner)

Build flavor `managed` (`applicationId com.focusgate.app.managed`) adds:

- `admin/FocusGateDeviceAdminReceiver.kt` and `res/xml/device_admin.xml`.
- `admin/ManagedDeviceController.kt`:
  - `isDeviceOwner()` / `isAdminActive()`
  - `applyBlockedPackages()` → `DevicePolicyManager.setPackagesSuspended(admin,
    packages, true)` and remembers the suspended set in preferences
  - `clearSuspensions()` for emergency access or turning managed mode off
  - optional `setLockTaskPackages` allowlist for dedicated-device kiosk use
- If a package cannot be suspended, the controller returns the failing
  packages and the UI shows the message instead of pretending success.

The personal flavor contains a stub controller, so managed APIs never ship in
the personal APK.

Provisioning (test device, no accounts on the device):

```bash
adb install -r app/build/outputs/apk/managed/debug/app-managed-debug.apk
adb shell dpm set-device-owner \
  com.focusgate.app.managed/com.focusgate.app.admin.FocusGateDeviceAdminReceiver
adb shell dpm list-owners
```

The component is `com.focusgate.app.managed` + the class
`com.focusgate.app.admin.FocusGateDeviceAdminReceiver`; it is **not**
`com.focusgate.app.managed.admin...`.

Managed mode does not need Usage Access or the overlay permission: Android
itself refuses to launch a suspended package and shows its own
"Blocked by work policy" dialog. Emergency access calls
`clearSuspensions()` and the expiry alarm re-applies the policy. A reboot also
re-applies the saved policy from Room (`BootReceiver`).

## 4. Emergency access

- Default 10 minutes, hard maximum 15 minutes.
- Stored as an `elapsedRealtime` deadline plus `Settings.Global.BOOT_COUNT`.
  A clock change cannot extend it; a reboot ends it.
- Uses `AlarmManager.setAndAllowWhileIdle` (inexact by design; no exact-alarm
  permission). If the alarm is delayed, the next poll or app start also
  re-evaluates the state.
- Visible in the UI (`Degraded`, remaining time) and never silently extends.
- In Managed mode, starting emergency clears suspensions; ending it or the
  expiry alarm re-applies them.

## 5. Verified tests (Android 16 / API 36 emulator, x86_64, WHPX)

Build and JVM tests:

```bash
export JAVA_HOME=<jdk17>
cd apps/android
./gradlew :app:assemblePersonalDebug :app:assembleManagedDebug \
  :app:testPersonalDebugUnitTest :app:testManagedDebugUnitTest
```

Observed: `BUILD SUCCESSFUL`; **22/22 unit tests pass in each flavor**
(`PolicyEvaluatorTest` 10, `ProtectionEvaluatorTest` 9, `EmergencyAccessTest` 3),
including OEM essential allowlist (Xiaomi/Samsung/Google dialers & launchers),
runtime default-app protection (`SystemPackages`), stopped-service degradation,
and Managed Mode partial-suspension degradation.
`connectedPersonalDebugAndroidTest` ran 2/2 Compose onboarding tests on the
emulator (`BUILD SUCCESSFUL`).

> **Note:** Passing unit tests and builds does **not** verify real-device
> enforcement. Physical-device testing on Redmi Note 13 (Android 15 / HyperOS)
> has not been executed yet; see `docs/MILESTONE1_TEST_REPORT.md` for the
> manual test checklist.

Manual emulator checks performed with `adb`:

| # | Check | Result |
|---|---|---|
| 1 | Onboarding 4 steps, consent gate, Usage Access/overlay/notification shown as granted | Pass |
| 2 | Restricted app opened → full-screen FocusGate overlay within the 1 s poll | Pass (screenshot captured) |
| 3 | Status shows `Protected` only while the service is running with both permissions | Pass |
| 4 | Emergency from the block screen: confirm → overlay hides, target app usable, UI shows `Degraded` and remaining time | Pass |
| 5 | End emergency from Home → overlay returns on next foreground | Pass |
| 6 | `appops set com.focusgate.app GET_USAGE_STATS ignore` → overlay hides, notification "Usage Access was revoked", Home shows `Degraded` / `Not granted` | Pass |
| 7 | Reboot with monitoring enabled → service restored, restriction still enforced | Pass |
| 8 | Device Owner provisioning on a clean emulator | Pass |
| 9 | Managed mode → `suspended=true`, opening the app shows Android's "Blocked by work policy" dialog | Pass |
| 10 | Managed emergency → `suspended=false` and app opens; end emergency → `suspended=true` again | Pass |
| 11 | Reboot while managed emergency active → emergency cleared, policy re-applied (`suspended=true`) | Pass |

Not tested here: physical Pixel/Samsung/Xiaomi/Oppo devices, OEM
autostart/battery killers, work profile/second user, Play Console review,
release signing, uninstall protection, lock-task UI.

## 6. Bypass and failure matrix

| # | Bypass / failure | Effect | Detection / mitigation |
|---|---|---|---|
| 1 | User revokes Usage Access | No foreground detection | Service hides overlay, posts "Protection lost", Home shows `Degraded`; never claims Protected |
| 2 | User revokes overlay ("Display over other apps") | No block screen | Same warning path; status is `Degraded` |
| 3 | Force-stop FocusGate | Monitoring stops until relaunch | Ongoing notification disappears; boot/update receiver restores on next start |
| 4 | OEM battery optimisation kills the service | Silent stop | Status reflects the service flag; onboarding explains battery settings |
| 5 | Safe mode | All third-party services off | Cannot be prevented; documented |
| 6 | Split screen / floating windows | Two apps visible | Poll observes the latest resumed package; one overlay at a time |
| 7 | Notification reply / quick settings | Partial interaction without the app foreground | Out of scope for a foreground blocker; documented |
| 8 | Browser tabs | A website is not an app package | Site blocking is a separate DNS/extension feature; not claimed |
| 9 | Renamed/repackaged APK | Different package name | User must reselect; package identity is the unit |
| 10 | Uninstall FocusGate (personal) | Everything stops | Cannot be prevented in personal mode; managed mode can use `setUninstallBlocked` |
| 11 | Clock change | Local timestamps skew | Emergency uses `elapsedRealtime` + boot count; usage timestamps are local telemetry |
| 12 | Root / custom ROM | Can disable anything | Out of scope; never advertised as tamper-proof |
| 13 | Work profile / second user | Separate app instances | Policy is per device+user; documented |
| 14 | Reboot during emergency | Pause ends | `BootReceiver` clears emergency and re-applies policy |
| 15 | Suspension rejected by DPM | Some apps remain available | Controller returns failing packages; UI shows the failure |

## 7. Google Play policy checklist

- No AccessibilityService, so no Accessibility declaration or review.
- Usage Access is a special access: explain it in-app before the system prompt
  and in the store listing. FocusGate only reads foreground events.
- Overlay: the user grants "Display over other apps"; the block screen is
  clearly labelled FocusGate and is not deceptive or hidden.
- Foreground service type `specialUse` with the
  `PROPERTY_SPECIAL_USE_FGS_SUBTYPE` justification; declare it in Play Console.
- No `QUERY_ALL_PACKAGES`.
- Data safety: package names, labels and timestamps only, stored locally; no
  content, keystrokes or messages.
- Managed Device Mode is offered to organisations with legitimate DPC
  provisioning; the app does not try to seize Device Owner on personal phones.
- Android 15+ restricts foreground-service starts from `BOOT_COMPLETED` for
  several types; the API 36 emulator allowed this `specialUse` start, but each
  target SDK/OEM combination must be retested.

## 8. Build flavours

| Flavour | applicationId | Behaviour |
|---|---|---|
| `personal` | `com.focusgate.app` | Usage Access + overlay monitor; managed APIs are stubs |
| `managed` | `com.focusgate.app.managed` | Device Owner controls; personal monitor remains available if the app is not Device Owner |

## 9. Remaining work

1. Physical-device matrix (Pixel, Samsung, Xiaomi, Oppo/Realme, low-RAM).
2. Adapt onboarding for a fully managed deployment where Usage Access and the
   overlay are irrelevant (the managed build currently shows the same four
   steps if the app is used in personal mode).
3. EMM/DPC provisioning flow (QR/NFC) and a documented off-boarding path.
4. Play Console declarations and store listing copy.
5. Release signing, crash reporting and telemetry consent.
