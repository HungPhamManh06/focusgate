# FocusGate – Product Requirements Document

Version 0.1 · Phase 0 · Status: approved for Phase 0 validation

## 1. Product

**FocusGate** – *Finish Your Tasks. Earn Your Freedom.*

FocusGate is a task manager with a deliberate gate: the user defines what must
be done today, works in timed focus sessions, and only then earns time in the
entertainment apps they chose to restrict.

The leverage comes from three parts working together:

| Pillar | Responsibility |
|---|---|
| **Task** | Capture and prioritise what matters. |
| **Focus** | Produce verifiable focused work, not just a checked box. |
| **Enforcement** | Make entertainment unavailable until the day's commitment is met. |

Core loop:

```
Create tasks → Confirm daily plan → Activate focus mode
→ Complete required tasks with valid focus time → Earn unlock minutes
→ Spend them in entertainment apps (tracked, capped)
```

## 2. Problem and principles

People do not lack task lists; they lack a cost for leaving. A plain to-do app
competes with infinite feeds and loses. FocusGate makes access to chosen
entertainment conditional on completed, focused work — within the limits the
operating system actually allows.

Product principles:

1. **The commitment is explicit.** A plan becomes binding only after the user
   confirms and activates it.
2. **Focus is evidence, not decoration.** Only server-validated sessions count.
3. **Rewards are server-decided.** The frontend can request a grant; it can
   never mint one.
4. **No fake control.** The product distinguishes Personal Strict Mode (user can
   always revoke permissions) from Managed Device Mode (organisation-owned
   devices with real device-owner enforcement).
5. **Minimum data.** No app content, no keystrokes, no screenshots. Only package
   or process identity, timestamps and decisions.

## 3. Personas

| Persona | Need | Success signal |
|---|---|---|
| **Student** | Study before short-form video | Completes Must Do tasks before opening blocked apps |
| **Knowledge worker** | Protect deep-work mornings | 2–4 valid focus sessions/day, plan completed |
| **Freelancer** | Separate work from entertainment on one PC | Unlock minutes spent deliberately, not ambiently |
| **Parent / managed device** | Durable restrictions for a child device | Managed Device Mode with device-owner provisioning |

## 4. Scope (modules)

### A. Authentication
Email/password sign-up, sign-in, sign-out, password reset, profile, multiple
devices, device list with revoke, sync status. Supabase Auth; RLS everywhere.

### B. Task management
Fields: id, user, title, description, category, kind (`must_do`, `should_do`,
`bonus`), priority, estimated minutes, required focus minutes, due date, status,
created/completed timestamps, optional recurrence rule.

Functions: create, edit, delete, complete, search/filter, sort, repeat, progress.
Task completion never happens automatically when a timer ends.

### C. Daily planner
A plan per user per date with states `DRAFT → CONFIRMED → ACTIVE → COMPLETED`
(plus `SKIPPED`). Plan tasks snapshot the task kind and required focus minutes.
After activation a Must Do task cannot be removed; downgrading it requires a
written reason, recorded in immutable plan history.

### D. Focus mode
Pomodoro 25/5, 50/10, custom and open-ended sessions. Start, complete, cancel
(pause/resume is intentionally deferred until server-side pause accounting is
introduced; see `docs/MILESTONE_A1_FOCUS_INTEGRITY_REPORT.md`). Every session is
attached to a device and optionally to a task and plan. Server computes validity
(`actual_minutes >= min_valid_focus_minutes`) and deterministic focus credit
(`credited_minutes = min(actual_minutes, planned_minutes * 2)`). Overtime beyond
2× planned duration never invalidates the session; task progress, plan focus
coverage, statistics, and extra-focus rewards use `credited_minutes` from valid
sessions only.

### E. App lock
Per-device list of blocked and allowed apps, grouped as social, video, games,
entertainment. Android uses usage access + accessibility window detection +
block screen (Personal Strict Mode) and DevicePolicyManager for managed devices.
Windows uses an OS-level agent that hooks foreground changes and applies the
user's policy. Both must show protection state and warn when permissions are
revoked. Two separate implementations, one shared policy contract.

### F. Reward & unlock engine
Unlock requires all Must Do tasks completed **and** their per-task focus
requirements met, validated by the backend. Defaults (all configurable per user):

- All Must Do complete: **30 min**
- Each completed Bonus task: **+5 min**
- Each additional 50 valid focus minutes: **+5 min**
- Extra bonus cap: **30 min**
- Daily total cap: **60 min**

Reward wallet, ledger, grants, usage history and transaction history are
server-owned. Idempotency keys prevent double grants and double spending.

### G. Statistics
Completed/open tasks, completion rate, focus minutes, session count, entertainment
minutes, daily/weekly/monthly reports, activity history.

### H. Device synchronisation
Tasks, plans, sessions, rewards and app-lock policy sync across devices. Offline
writes are queued and replayed with client-generated IDs. The backend is
authoritative. Conflict rules are defined per entity in `docs/ARCHITECTURE.md`.
A device that has not been authenticated or is revoked cannot unlock anything.

## 5. State machines

**Daily plan**

| From | Allowed to | Guard |
|---|---|---|
| draft | confirmed, skipped | ≥1 Must Do task |
| confirmed | active, skipped | ≥1 Must Do task |
| active | completed, skipped | all Must Do tasks complete with focus |
| completed | — | terminal |

**Unlock grant**

`active → consumed` (remaining reaches 0) or `active → expired` (window passes)
or `active → revoked` (device revoked). Grants are never edited by clients.

**Focus session**

`running → completed` or `running → cancelled` (the schema retains `paused` in
`focus_session_status` for future server-verified pause intervals). Only
`completed` sessions that satisfy the minimum validity rule count, crediting
`min(actual_minutes, planned_minutes * 2)` toward task and plan requirements.

## 6. Supported platforms

| Platform | Technology | Phase 0 status |
|---|---|---|
| Web dashboard | Next.js + React + TypeScript + Tailwind + shadcn/ui | Planned (Phase 1) |
| Android | Kotlin, Compose, Material 3, Room, WorkManager/UsageStats, Accessibility | PoC source, **not compiled here** (no SDK) |
| Windows agent | C#, .NET 10, WinForms, SQLite, Win32 APIs | PoC built and executed |
| Backend | Supabase Auth, PostgreSQL, Realtime, RLS | Migrations written and executed against real Postgres (PGlite) |

## 7. Required web screens

Login, Register, Dashboard, Tasks, Daily Planner, Focus Mode, App Lock Settings,
Reward Wallet, Statistics, Device Management, Settings. Every screen must have
loading, empty and error states and must call real APIs — no decorative-only UI.

Android: Onboarding (permissions), Login, Home, Tasks, Planner, Focus, App
selection, Lock screen, Wallet, Statistics, Device settings.

## 8. Non-goals

- Root, exploits, kernel drivers or undocumented bypasses of OS security.
- Claiming an unbreakable block. Personal Strict Mode is friction, not DRM.
- Reading app content, keystrokes, notifications text or screenshots.
- Remote shell or arbitrary command execution from the backend.
- Blocking apps the user did not explicitly select.
- Deciding rewards on-device.

## 9. Success metrics

- Plan completion rate per active user per week.
- Share of Must Do tasks completed with valid focus coverage.
- Median time from app launch to block screen on Android and Windows.
- Reward disputes / double-grant incidents (target: 0).
- Permission-loss incidents surfaced to the user vs silent failures (target: all).
- Week-2 retention of users who activated ≥3 plans.

## 10. Policy & legal constraints

- **Google Play:** Accessibility API use must be core functionality, disclosed
  prominently, and limited to what is needed. No `QUERY_ALL_PACKAGES`; the PoC
  uses launcher-only package visibility. Foreground service uses the
  `specialUse` type with a written subtype justification.
- **Windows:** No driver, no elevation by default, no tampering with other users'
  processes. Only user-selected apps, and only while the user session is active.
- **Privacy:** Store only identifiers, timestamps and decisions. Support export
  and deletion of account data.

## 11. Open questions

1. Should unlock minutes expire at local 04:00 or at midnight? (Current
   implementation: 04:00 local, to cover late sessions.)
2. Should Should Do tasks contribute to streak statistics but never to rewards?
   (Current: yes, statistics only.)
3. Managed Device Mode requires an EMM/DPC decision; deferred until after Phase 5.
4. On Android, whether to prefer accessibility overlay or full-screen activity
   per OEM must be decided from the Phase 0 device matrix (not executable here).
