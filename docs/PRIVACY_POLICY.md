# FocusGate Privacy Policy & Data Safety

**Effective Date:** 2026-11-22  
**Applies to:** FocusGate Web (`apps/web`), Windows Agent (`apps/windows-agent`), and Android App (`apps/android`).

---

## 1. Core Privacy Principle

FocusGate enforces intentional work and entertainment budgets **without inspecting your personal content**. We only process the minimum operational metadata required to track focus blocks, evaluate daily gate completion, and enforce your own block/allow rules.

## 2. Data We Process

| Category | What Is Collected | Why It Is Needed | Where It Lives |
|---|---|---|---|
| **Account & Profile** | Email address, display name, IANA timezone | Authentication, multi-device sync, daily plan date boundaries | Supabase Auth & PostgreSQL (`profiles`) |
| **Tasks & Daily Plans** | Task titles, optional notes, gate tier, focus targets | Daily gate tracking and focus requirements | PostgreSQL (`tasks`, `daily_plans`, `daily_plan_tasks`) |
| **Focus Sessions** | Session start/end/pause timestamps, planned & credited duration, mode | Server-verified focus duration and reward unlocking | PostgreSQL (`focus_sessions`) |
| **Devices & Policy Rules** | Device name, platform (`web`/`windows`/`android`), app/process identifiers you configure (`block_rules`) | Syncing your lock state and revoking lost devices | PostgreSQL (`devices`, `block_rules`), local DPAPI/Room caches |
| **App Usage Telemetry** | Foreground app identifier, optional display name, duration, blocked flag (`usage_events`) | Enforcing block rules and displaying recent device activity | Local SQLite/Room + PostgreSQL (`usage_events`) |

## 3. What FocusGate NEVER Collects

- No screen contents, screenshots, or keystrokes.
- No browser history URLs or message contents.
- No `AccessibilityService` content scraping on Android (Android Personal mode uses `UsageStatsManager` + `SYSTEM_ALERT_WINDOW`; Managed mode uses `DevicePolicyManager.setPackagesSuspended`).
- No selling or sharing of user data with third-party advertisers.

## 4. Credential & Local Storage Security

- **Web:** Supabase session cookies (`HttpOnly` / SSR middleware); `SUPABASE_SERVICE_ROLE_KEY` is never exposed to browser code.
- **Windows Agent:** Device tokens are encrypted at rest using Windows **DPAPI** (`DataProtectionScope.CurrentUser`) in `%LocalAppData%\FocusGate\Agent\credentials.dpapi`.
- **Android:** Local rules and usage records are stored in app-private Room storage.

## 5. User Controls & Revocation

- You can **rename or revoke** any registered device from `/devices` at any time. Revoking a device immediately cancels any open focus session on that device, revokes active entertainment grants issued to it, and blocks future API sync (`403`).
- Deleting your account cascades and removes associated profile, tasks, plans, sessions, devices, and ledger records (`ON DELETE CASCADE`).
