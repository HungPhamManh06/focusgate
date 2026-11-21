# Android App Lock

Status: Phase 0 PoC source written, **not compiled or device-tested** in this
environment (no Android SDK; installed JDK 27 is outside the AGP/Gradle support
matrix). Do not treat the statements below as device-verified.

## 1. What Android actually allows

| Mechanism | What it can do | What it cannot do |
|---|---|---|
| `UsageStatsManager` (`PACKAGE_USAGE_STATS`) | Read foreground/background events and aggregate usage; detect which package is in front | Block anything. It is telemetry with a user-granted special access. |
| `AccessibilityService` | Receive `TYPE_WINDOW_STATE_CHANGED`, see the package name; draw an accessibility overlay or launch an activity | Read content unless `canRetrieveWindowContent=true` (we keep it false); block at kernel level; survive the user disabling accessibility. |
| `SYSTEM_ALERT_WINDOW` overlay | Draw over other apps after a separate user grant | Intercept input inside secure windows; survive revocation. |
| Foreground service | Keep monitoring running with an ongoing notification | Guarantee survival against OEM battery killers or force-stop. |
| `DevicePolicyManager` as **Device Owner** | `setPackagesSuspended` (true suspension), `setLockTaskPackages`, hide apps, enforce policy | Work without device-owner/DPC provisioning; apply to a personal phone that the user controls without a factory reset + provisioning flow. |
| Play Integrity / Usage Access checks | Detect missing permissions and warn | Prevent a determined user from disabling access in settings. |

**Conclusion:** on a personal phone, blocking is a *friction* mechanism, not an
inviolable lock. Managed Device Mode is the only path to real enforcement, and
it requires a legitimate device-owner deployment (EMM/DPC), not a hidden trick.

## 2. Chosen PoC architecture (Personal Strict Mode)

```
UsageStatsManager ──poll 5s──► AppUsageMonitorService ──Room──► usage_events
                                        │
                                        └─ detects blocked package (fallback)
AccessibilityService ──window changed──► PolicyEvaluator ──► BlockedActivity
        │                                                        │
        └─ policy cache (Room, Flow)                             └─ "Back to tasks"
BootReceiver ──restores service──► status notification (on/off + permission missing)
```

Files:

- `service/AppUsageMonitorService.kt` – foreground service, `specialUse` type,
  polls `queryEvents`, writes aggregated usage, launches the block screen as a
  fallback path.
- `service/AppBlockAccessibilityService.kt` – minimal accessibility config
  (`typeWindowStateChanged`, `canRetrieveWindowContent=false`), launches
  `BlockedActivity` for blocked packages.
- `ui/BlockedActivity.kt` – full-screen honest block screen.
- `ui/MainActivity.kt` – permission onboarding, app selection, monitoring switch.
- `util/PermissionChecks.kt` – usage access, accessibility state, settings deep
  links.
- `service/BootReceiver.kt` – restores monitoring after reboot; warns if
  accessibility was revoked.
- `policy/PolicyEvaluator.kt` – pure decision logic with an essential allowlist
  (dialer, messaging, system UI, settings, installer, Play services, camera,
  maps, emergency).

No root, no exploit, no hidden surveillance. Only launcher-visible apps are
listed; `QUERY_ALL_PACKAGES` is deliberately **not** requested.

## 3. Permission UX (required)

Onboarding must show, in plain language, before each prompt:

1. **Usage access** — "FocusGate reads which app is in the foreground to measure
   entertainment time. It does not read what you do inside apps."
2. **Accessibility** — "FocusGate detects when a selected app opens so it can
   show the block screen. It does not read screen content."
3. **Notifications** — "The ongoing notification tells you protection is on, and
   warns you if a permission is revoked."
4. **Battery optimisation** (optional) — explain why some phones stop background
   services, and link to the OEM settings.

The home screen must always display the real state (granted/not granted/running)
and must never show "protected" when a required permission is missing.

## 4. Block screen behaviour

- Launched with `FLAG_ACTIVITY_NEW_TASK | FLAG_ACTIVITY_CLEAR_TOP`, excluded from
  recents.
- Back button goes home, not to the blocked app.
- Shows the app label, the reason, remaining Must Do summary (Phase 3+), a
  "Back to my tasks" button and a short honesty note.
- Auto-dismisses when the user leaves via Home/Recents.

Platform risk: Android 10+ restricts background activity launches. Vendors that
enforce it strictly may refuse the launch. Phase 1 must test, per OEM, one of:

1. activity launch (current PoC),
2. accessibility overlay (`TYPE_ACCESSIBILITY_OVERLAY` via
   `AccessibilityService`) — usually accepted because it is drawn by the service,
3. full-screen intent notification (requires `USE_FULL_SCREEN_INTENT` and is
   restricted to calling/alarm use cases on Android 14+, so it is a fallback
   only where policy allows).

Decision must be recorded per device matrix; the policy engine is shared.

## 5. Managed Device Mode (future, legitimate DPC)

Requirements:

- Device Owner via `adb shell dpm set-device-owner` (testing) or a real EMM
  provisioning flow (QR/NFC, factory-reset device).
- `DevicePolicyManager.setPackagesSuspended(admin, arrayOf(pkg), true)` for true
  suspension instead of an overlay.
- `setLockTaskPackages` for kiosk-style focus sessions if required.
- A visible administrator app, documented policies, and the ability for the
  organisation to remove management.
- Never applied to a personal device without explicit, informed provisioning.

This mode is the only one where FocusGate may claim "enforced by device policy".
It is out of scope until Phase 5.

## 6. Bypass and failure matrix

| # | Bypass / failure | Effect | Detection / mitigation |
|---|---|---|---|
| 1 | User disables Accessibility | No block screen | `PermissionChecks` + notification + red status; never claim protected |
| 2 | User revokes Usage access | No monitoring/telemetry | Foreground service updates notification; in-app status |
| 3 | Force-stop FocusGate | No monitoring until relaunch | Ongoing notification disappears; Phase 1: WorkManager periodic check + boot receiver |
| 4 | OEM battery optimisation kills service | Silent stop | `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` guidance; heartbeat + notification |
| 5 | Safe mode | All third-party services off | Cannot be prevented; document |
| 6 | Split screen / floating windows | Two apps visible | Accessibility event fires for the newly focused window; still one block screen |
| 7 | Notification reply / quick settings | Partial app interaction without foreground | Out of scope for a foreground blocker; document |
| 8 | Browser tabs | A site in Chrome is not an app package | Do not claim site blocking; future extension/DNS feature is separate |
| 9 | Renamed/repackaged APK | Different package name | Package identity is the unit; user must reselect |
| 10 | Uninstall FocusGate | Everything stops | Managed mode: `setUninstallBlocked`; personal mode: documented |
| 11 | Clock change | Local timestamps skew | Reward expiry is server-side; offline grants use last server time + monotonic clock where available |
| 12 | Root / custom ROM | Can disable anything | Out of scope; never advertise as tamper-proof |
| 13 | Work profile / second user | Separate app instances | Policy is per device+user; document |
| 14 | Android 10+ background launch restriction | Block screen refused | Fallback overlay/notification; per-OEM tests in Phase 1 |
| 15 | Accessibility service crash | No block screen | `onServiceConnected` re-registers; watchdog notification in Phase 1 |

## 7. Google Play policy checklist

- Accessibility is used for **core functionality** (app blocking the user
  explicitly configured), declared in the Play listing and in-app disclosure.
- `canRetrieveWindowContent=false`; no text extraction, no keylogging.
- No `QUERY_ALL_PACKAGES`; launcher-only visibility.
- Foreground service type `specialUse` with subtype justification.
- Prominent disclosure + affirmative consent before enabling accessibility.
- Data safety: package names + timestamps only; no content; deletion supported.
- Managed Device Mode marketed only to organisations with legitimate DPC.

## 8. Phase 1 device test matrix (must pass before Phase 4)

| Device class | Android | Focus | Tests |
|---|---|---|---|
| Pixel (AOSP-like) | 14/15 | Stock | block latency, boot restore, revocation UX |
| Samsung | 14/15 | One UI | background launch, battery optimisation |
| Xiaomi/Redmi | 13/14 | HyperOS/MIUI | autostart restrictions, service kill |
| Oppo/Realme | 13/14 | ColorOS | background launch restrictions |
| Low-RAM device | 11/12 | Stock | service stability, Room performance |

Measure: time from blocked app foreground to block screen; false positives;
battery drain over 1 hour; behavior after reboot; behavior after permission
revocation.
