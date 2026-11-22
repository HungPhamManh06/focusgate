# FocusGate — Dashboard 2.0.1: UX Polish & Next Action Report

## 1. Problems Addressed in Milestone 2.0.1

Following the **"Less information. Clearer decisions. Faster actions."** design philosophy, Milestone 2.0.1 refines the Dashboard 2.0 layout without altering FocusGate's brand identity, schema, or business rules:

1. **P1 — Over-dense 5-Stage Journey Cells in `Today's Mission`:**
   - *Before:* Each of the 5 step boxes tried to show an icon, step number, title, multi-line description, AND live numeric progress (`0 tasks`, `0m / 0m`, `0/0 done`), causing cramped text wrapping and low readability.
   - *After:* Each step in the 5-stage rail now contains strictly: **Step number (`01`–`05`)**, **State Icon** (`Check` for completed, stage icon for current, `Lock` for locked), **Step label**, and a **single-line concise description** (`"Completed"` when done, or a short 3-word action hint). All detailed narrative guidance and live metrics are separated into a dedicated **Current Step Spotlight** immediately below the rail (`STEP 0X · LABEL`).
   - *Visual Contrast:* Removed low opacity (`opacity-75`) on upcoming/locked steps so text contrast remains crisp and WCAG AA compliant while clearly signalling state through border, surface token, and lock icon.

2. **P1 — Misleading `0/0` and `0%` Progress When Not Configured:**
   - *Before:* A newly created draft plan with 0 Must-do tasks displayed `Plan Progress: 0/0 (0% of today's Must-do gate completed)`, a `0/0` progress ring (`0% complete`), and `Verified focus coverage: 0m / 0m required (0%)`.
   - *After:*
     - **Plan Progress Stat Card:** Displays `"No tasks selected"` with hint `"Awaiting your first Must-do task"` (or notes non-gate draft tasks if only Should-do/Bonus tasks exist) when `mustDoTotal === 0`, and `"No plan"` when `plan === null`.
     - **Must-do Progress Ring:** Only renders the percentage ring when `mustDoTotal > 0` (`mustDoPercent !== null`). When `mustDoTotal === 0`, renders a clean dashed circular state: `"No Must-do tasks yet · Awaiting your first task"`.
     - **Verified Focus Coverage:** When `focusRequired === 0` (`focusPercent === null`), replaces `0m / 0m required (0%)` and the empty progress bar with `"Focus target not set"` and an actionable explanation.

3. **P1 — Duplicate CTAs Pointing to the Same Destination:**
   - *Before:* In Draft state, the user saw `"Continue planning"` (accent button in Header), `"Open planner →"` (in Mission Card header), `"Add tasks..."` (in Mission Card body), and `"Edit plan"` (in Mission Card footer) — four links to `/planner` on one screen.
   - *After:*
     - Removed the redundant `"Open planner →"` link from the `DailyMissionCard` header and inline body links.
     - Styled the PageHeader action as a secondary `outline` shortcut while keeping the **single high-contrast `accent` Primary CTA** inside the `DailyMissionCard` footer for the current step.
     - Enforced strict 1 Primary + at most 1 Secondary CTA per state across the entire Dashboard.

4. **P2 — `Your Next Move` Task Recommendation & Empty States:**
   - Prioritizes real open tasks in strict order:
     1. Unfinished `must_do` in today's plan.
     2. Unfinished `must_do` in the backlog ordered by nearest deadline, then priority.
     3. Unfinished `should_do` (in today's plan first, then backlog).
     4. `bonus` tasks **only** when zero unfinished `must_do` tasks exist.
   - Completed and cancelled tasks are strictly excluded.
   - When all tasks are completed: renders `"You're all caught up. No outstanding Must-do tasks need your attention."` with `[Review tomorrow's plan]`.
   - When the workspace has zero tasks and no plan yet: renders `"Add your first task first."` with `[Add tasks to backlog]`.
   - Removed duplicate `"Add to today's plan"` link from `NextMoveCard` so it never competes with the Mission Card's planner CTA.

5. **P2 — Reward Wallet & Sidebar Alignment:**
   - **Sidebar:** Simplified label from `"UNLOCKED TIME"` to `"AVAILABLE TIME"` (`35m` + `Open wallet →`), using the exact same authoritative `availableMinutes` source as `RewardWalletCard` without repeating `Earned`, `Spent`, or `Expired`.
   - **Reward Wallet Card:** Displays authoritative `Available leisure time`, 3-column breakdown (`Earned`, `Spent`, `Expired` summed from expired grant rows' `remainingMinutes`, never inferred via `earned - spent`), and explicit empty-grant copy:
     - *"No active grants. Previous grants have expired. Complete today's plan to earn a fresh grant."*

6. **P2 — Supporting Information (`Due Soon` & `Recent Focus`):**
   - `Due Soon` shows up to 4 open tasks with deadlines (prioritizing overdue and nearest due date) and uses the exact clean empty state: `"Nothing due soon. You have no outstanding tasks with an approaching deadline."`

---

## 2. New & Updated Files

| File | Description |
| :--- | :--- |
| `apps/web/lib/domain/dashboard-state.ts` | **New.** Pure, unit-tested domain view-model helpers: `resolveMissionPhase`, `buildMissionViewModel` (with `null` percentages when unconfigured to prevent `0/0`), `formatPlanProgressStat`, `selectNextMoveFromTasks`, and `summarizeWalletForDashboard`. |
| `apps/web/components/domain/daily-mission-card.tsx` | **Updated.** Minimalist 5-step rail (`01 Plan` → `05 Unlock`) with horizontal scroll container on narrow mobile (`min-w-[540px] sm:min-w-0`), dedicated Current Step Spotlight (`STEP 0X · LABEL`), non-misleading empty states, and deduplicated footer CTAs. |
| `apps/web/components/domain/next-move-card.tsx` | **Updated.** Clean task recommendation card with rationale, single `View task` CTA, and distinct empty states for "All caught up" vs. "No tasks created yet". |
| `apps/web/components/domain/reward-wallet-card.tsx` | **Updated.** Uses `summarizeWalletForDashboard` for authoritative balance, `Earned / Spent / Expired` breakdown, and clear expired/no-grant messaging. |
| `apps/web/components/shell/sidebar.tsx` | **Updated.** Simplified wallet widget to `AVAILABLE TIME` + `Open wallet →`. |
| `apps/web/components/ui/progress.tsx` | **Updated.** Added accessible `aria-label` support to both `Progress` and `ProgressRing` (`role="progressbar"`). |
| `apps/web/app/(app)/page.tsx` | **Updated.** Integrated `formatPlanProgressStat`, `resolveMissionPhase`, non-competing header actions, and updated `Due Soon` empty state. |
| `apps/web/tests/dashboard-state.test.ts` | **New.** Automated unit tests verifying all 8 mission phases, `0/0` empty progress protection, `Your Next Move` priority & bonus-suppression rules, and wallet expired grant summation. |

---

## 3. CTA Mapping Matrix by Plan State

| Plan Phase | Condition | Header Action (`outline`) | Mission Spotlight Step | Mission Primary CTA (`accent`) | Mission Secondary CTA (`outline`) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`no_plan`** | `plan === null` | `Create today's plan` | `STEP 01 · PLAN` | `Create today's plan` | — |
| **`draft_empty`** | `draft` with `mustDoTotal === 0` | `Continue planning` | `STEP 01 · PLAN` | `Add tasks to today's plan` | — |
| **`draft_ready`** | `draft` with `mustDoTotal > 0` | `Continue planning` | `STEP 02 · COMMIT` | `Confirm plan` | `Edit plan` |
| **`confirmed`** | `plan.status === "confirmed"` | `Activate focus` | `STEP 02 · COMMIT` | `Activate focus` | `View plan` |
| **`active_focus`** | `active` with focus or Must-dos left | `Go to focus` | `STEP 03 · FOCUS` (or `04 COMPLETE` if focus met) | `Continue focus` | `View plan` |
| **`active_ready_to_close`** | `active` with all Must-dos & focus met | `Complete day` | `STEP 04 · COMPLETE` | `Complete day` | `View plan` |
| **`completed_unclaimed`** | `completed` and `!todayGrant` | `Claim reward` | `STEP 05 · UNLOCK` | `Claim today's reward` | `View summary` |
| **`completed_claimed`** | `completed` and `Boolean(todayGrant)` | `View wallet` | `STEP 05 · UNLOCK` | `View wallet` | `Review today's progress` |

---

## 4. Responsive & Accessibility Verification

- **Desktop & Laptop (`1440×900`, `1280×800`):** 250px sticky sidebar; 3 equal-height Daily Overview stat cards; 2-column main grid (`~66%` `DailyMissionCard` + `~34%` `RewardWalletCard`); 5-step rail displays in a 5-column grid without text cramping because each cell holds only the step number, icon, label, and 1-line subtitle.
- **Tablet (`1024×768`, `768×1024`):** Stat cards adapt to 2 columns (`sm:grid-cols-2`); Mission Card and Wallet Card stack cleanly below `1024px`.
- **Mobile (`390×844`, `360×800`):** The 5-step journey rail sits inside an intentional horizontal scroll container (`-mx-1 overflow-x-auto px-1` with `min-w-[540px] sm:min-w-0`), preventing 5 tiny columns from being crushed on a 360px screen while keeping the rest of the page free of horizontal overflow.
- **Accessibility:**
  - Single `h1` in `PageHeader`, semantic `<section aria-label="...">` landmarks, `<ol aria-label="FocusGate daily journey">` with `aria-current="step"`.
  - Both `Progress` and `ProgressRing` expose `role="progressbar"`, `aria-label`, `aria-valuenow`, `aria-valuemin`, and `aria-valuemax`.
  - Step states are communicated via icon (`Check`, stage icon, `Lock`) + text (`Completed`, short description), never by color alone.

---

## 5. Build & Test Results (Executed)

```text
> npm test --workspace=@focusgate/web
✔ Mission state mapping and empty progress handling across all plan states
✔ Your Next Move selection prioritizes plan Must-dos, deadlines, and suppresses Bonus and completed tasks
✔ Reward wallet summary computes authoritative active and expired balances without earned - spent inference
ℹ tests 3 | pass 3 | fail 0

> npm run typecheck
tsc --noEmit (0 errors across @focusgate/web and @focusgate/shared-contracts)

> npm run build -w @focusgate/web
✓ Compiled successfully
✓ Generating static pages (3/3)
```
