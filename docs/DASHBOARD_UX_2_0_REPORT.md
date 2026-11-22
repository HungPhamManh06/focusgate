# FocusGate — Dashboard UX Redesign 2.0 Report

## 1. Initial UX Problems Identified

Before this redesign, the Web Dashboard (`apps/web/app/(app)/page.tsx`) functioned primarily as a passive metrics summary rather than an action-oriented daily guide:

1. **Under-emphasized Daily Gate Journey:** "Today's gate" showed a progress ring and up to 4 tasks, but did not visually map where the user stood in the end-to-end FocusGate contract (`Plan → Commit → Focus → Complete → Unlock`) or what was required to unlock the next stage.
2. **Redundant `Unlocked Time` Metric:** Available reward minutes appeared in **three** places simultaneously on the same screen (the sidebar badge, the 4th stat card in the top row, and the Reward Wallet card), diluting visual hierarchy.
3. **Ambiguous Next Action & Competing Header CTAs:** The page header always rendered two static buttons (`Open planner` and `Start focus`) regardless of whether the user had no plan, a draft plan, a confirmed plan waiting for activation, an active plan ready to close, or an unclaimed reward.
4. **Incomplete Reward Wallet Context:** The Dashboard wallet card displayed `available`, `earned`, and `spent`, which could confuse users when `earned - spent !== available` due to expired grants. It lacked an explicit `Expired` breakdown and clear next-expiration framing.
5. **No Task-Level Recommendation ("Your Next Move"):** Users had to mentally cross-reference "Today's gate" and "Due soon" to decide which specific task deserved their next focus block.
6. **Indistinguishable Completed vs. Claimed State:** When a daily plan reached `completed`, the Dashboard always rendered `Claim today's reward`, even after the base grant for that plan had already been minted into `unlock_grants`.

---

## 2. Summary of Changes Implemented

Following the **"One screen. One clear next action."** principle while preserving FocusGate's Editorial Discipline aesthetic (`Instrument Serif` + `Inter Variable`, warm paper `#f4f4f0` canvas, `#2b59ff` cobalt accent, and dark-mode token swap):

1. **State-Driven Greeting Header (`apps/web/app/(app)/page.tsx`):**
   - Keeps the time-of-day editorial greeting (`Good morning/afternoon/evening, <FirstName>.`) and action-oriented subcopy: *"Make today count. Finish what matters, focus deeply, and earn your time."*
   - Renders **one single primary CTA** on the right that adapts to the real plan lifecycle state:
     - **No plan:** `Create today's plan` (`createPlanAction`)
     - **Draft plan:** `Continue planning` (`/planner`)
     - **Confirmed plan:** `Activate focus` (`activatePlanAction`)
     - **Active plan (work remaining):** `Go to focus` (`/focus`)
     - **Active plan (all Must-dos & focus targets met):** `Complete day` (`completePlanAction`)
     - **Completed plan (unclaimed):** `Claim reward` (`claimRewardAction`)
     - **Completed plan (already claimed):** `Open reward wallet` (`/wallet`)

2. **Streamlined 3-Card Daily Overview (`apps/web/app/(app)/page.tsx`):**
   - Removed the duplicate `Unlocked Time` stat card.
   - Standardized on 3 equal-height cards (`sm:grid-cols-2 lg:grid-cols-3`):
     - **Card 1 — Focus today:** Verified focus minutes today (`focus.minutes`), valid session count (`focus.validSessions`), and progress against today's plan focus target when a plan exists.
     - **Card 2 — Open tasks:** Total open tasks (`counts.open`), broken down into `mustDoOpen` vs. `should-do & bonus`, wrapped in an accessible link to `/tasks`.
     - **Card 3 — Plan progress:** Completed vs. total Must-do tasks (`mustDoCompleted/mustDoTotal`) and completion percentage, or `"No plan"` with a clear prompt when no plan exists today.
   - No fake streak metrics were invented.

3. **Centerpiece `DailyMissionCard` (`apps/web/components/domain/daily-mission-card.tsx`):**
   - Visualizes the 5-stage journey rail (`01 Plan → 02 Commit → 03 Focus → 04 Complete → 05 Unlock`) with icon, step name, short description, live data metric, and `completed` / `current` / `locked` visual states (`aria-current="step"`).
   - Adapts headline, narrative guidance, progress visualization, and footer CTAs across all real lifecycle states (`No Plan`, `Draft`, `Confirmed`, `Active`, `Completed — Unclaimed`, `Completed — Claimed`).

4. **Transparent `RewardWalletCard` (`apps/web/components/domain/reward-wallet-card.tsx`):**
   - Positioned alongside `DailyMissionCard` on desktop (`~66% / ~34%` split) and stacked cleanly below it on mobile.
   - Displays authoritative `wallet.availableMinutes` (`Available leisure time`), plus a 3-column breakdown of `Earned` (`wallet.earnedMinutes`), `Spent` (`wallet.consumedMinutes`), and `Expired` (computed directly from expired grant rows' `remainingMinutes`, never inferred via `earned - spent`).
   - Highlights the `Next expiration` grant amount and local timestamp, or explains when no active grants exist.
   - Primary link: `View wallet history →` (`/wallet`).

5. **Intelligent `NextMoveCard` (`apps/web/components/domain/next-move-card.tsx` & `apps/web/lib/data/dashboard.ts`):**
   - Added `getNextMoveCandidate(plan)` in `apps/web/lib/data/dashboard.ts`.
   - Selection rules using real tasks from `public.tasks` and `public.daily_plan_tasks`:
     1. Prioritizes unfinished tasks in today's active/confirmed/draft plan first, then falls back to open backlog tasks.
     2. Strictly prioritizes unfinished `must_do` tasks and **suppresses `bonus` tasks whenever any `must_do` remains open**.
     3. Breaks ties by nearest `dueDate` (overdue / due today first) and then by `priority` (`urgent → high → medium → low`).
   - Displays task title, commitment tier badge (`KindBadge`), priority, estimated duration, focus coverage, relative due date, and a plain-language reason explaining why the task is recommended.
   - Uses secondary navigation (`View task →` and optional `Add to today's plan`) so it never duplicates the primary CTA in `DailyMissionCard`.
   - Renders the `"You're all caught up. Take a moment to review tomorrow's plan."` state when no open tasks exist.

6. **Refined `Due Soon` & `Recent Focus` (`apps/web/app/(app)/page.tsx`):**
   - **Due Soon:** Lists up to 4 open tasks ordered by nearest deadline, with an explicit `Overdue` danger badge when past due, `KindBadge`, estimated minutes, and `View all tasks →`.
   - **Recent Focus:** Lists up to 4 recent completed sessions with task title, date/time, duration, `Valid` / `Below min` badge, and a footer note explaining the server-verified minimum threshold (`workspace.settings.minValidFocusMinutes`).

---

## 3. New & Updated Components

| File | Role |
| :--- | :--- |
| `apps/web/components/domain/daily-mission-card.tsx` | **New.** 5-stage journey rail (`Plan → Commit → Focus → Complete → Unlock`), state-specific body & footer CTAs. |
| `apps/web/components/domain/reward-wallet-card.tsx` | **New.** Authoritative leisure balance, `Earned / Spent / Expired` breakdown, next expiration panel, and wallet history link. |
| `apps/web/components/domain/next-move-card.tsx` | **New.** Highest-leverage task recommendation card with rationale and all-caught-up empty state. |
| `apps/web/lib/data/dashboard.ts` | **Updated.** Added `getNextMoveCandidate(plan)` and `NextMoveSuggestion` interface. |
| `apps/web/lib/data/rewards.ts` & `types.ts` | **Updated.** Exposed `dailyPlanId` on `Grant` so the Dashboard can verify whether today's completed plan has already claimed its base reward grant. |
| `apps/web/app/(app)/page.tsx` | **Updated.** Recomposed around the 4-zone Dashboard UX 2.0 layout (`Greeting Header`, `Daily Overview`, `Today's Mission + Wallet`, `Supporting Information`). |
| `apps/web/components/ui/skeleton.tsx` | **Updated.** Matched `PageSkeleton` to the new 3-card overview + 2-column mission/wallet + 2-column supporting layout. |
| `docs/DESIGN_SYSTEM.md` | **Updated.** Documented `DailyMissionCard`, `RewardWalletCard`, `NextMoveCard`, and the 3-card Dashboard overview pattern. |

---

## 4. Plan State Handling Matrix

| State | Condition (Real Data) | Header CTA | Mission Card Stage Highlight | Mission Card Primary CTA | Secondary Action |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **A. No Plan** | `plan === null` | `Create today's plan` | `01 Plan` (`current`), stages 2–5 `locked` | `Create today's plan` | `Review task backlog` |
| **B. Draft Plan** | `plan.status === "draft"` | `Continue planning` | `01 Plan` (`current`), stages 2–5 `locked` | `Confirm plan` (disabled if `mustDoTotal === 0` with warning hint) | `Edit plan` |
| **C. Confirmed Plan** | `plan.status === "confirmed"` | `Activate focus` | `01 Plan` (`completed`), `02 Commit` (`current`) | `Activate focus` | `View plan` |
| **D1. Active Plan (In Progress)** | `plan.status === "active"` and Must-dos or focus remaining | `Go to focus` | `03 Focus` (`current`) | `Go to focus` | `View plan` + `Complete day` (ghost) |
| **D2. Active Plan (Ready to Close)** | `plan.status === "active"` and `mustDoCompleted === mustDoTotal` and `focusDone >= focusRequired` | `Complete day` | `04 Complete` (`current`) | `Complete day` | `Go to focus` |
| **E1. Completed (Unclaimed)** | `plan.status === "completed"` and `!todayGrant` | `Claim reward` | Stages 1–4 `completed`, `05 Unlock` (`current`) | `Claim today's reward` | `View summary` |
| **E2. Completed (Claimed)** | `plan.status === "completed"` and `Boolean(todayGrant)` | `Open reward wallet` | All 5 stages `completed` (`Reward claimed` badge) | `Spend in wallet →` | — |

---

## 5. Authoritative Data Sources per Metric

| Section / Metric | Source Function & Field | Notes |
| :--- | :--- | :--- |
| **Focus Today (minutes & valid sessions)** | `getTodayFocusSummary()` → `focus.minutes`, `focus.validSessions`, `focus.sessions` | Server-verified completed sessions from `public.focus_sessions` in user's timezone. |
| **Open Tasks (total, must-do, others)** | `getTaskCounts()` → `counts.open`, `counts.mustDoOpen` | Queries `public.tasks` where `status in ('todo', 'in_progress')`. |
| **Plan Progress (`X/Y` & `%`)** | `getTodayPlan()` → `plan.progress.mustDoCompleted`, `plan.progress.mustDoTotal` | Backed by view `public.v_plan_progress`. |
| **Today's Mission Journey & Checklist** | `getTodayPlan()` → `plan.status`, `plan.tasks`, `plan.progress` + `workspace.settings` | Uses real plan tasks, per-task `focusDone`, and server reward settings. |
| **Today's Claimed Grant Detection** | `getWallet()` → `wallet.grants.find(g => g.dailyPlanId === plan.id && g.source === 'daily_plan_base')` | Checks `public.unlock_grants` directly. |
| **Wallet Available / Earned / Spent** | `getWallet()` → `availableMinutes`, `earnedMinutes`, `consumedMinutes` | Aggregated from `public.unlock_grants`. |
| **Wallet Expired Minutes** | `wallet.grants.filter(g => g.status === 'expired' \|\| (g.status === 'active' && new Date(g.expiresAt) <= now))` | Sum of `remainingMinutes` on expired grants; never guessed via subtraction. |
| **Your Next Move** | `getNextMoveCandidate(plan)` | Prioritizes unfinished Must-dos and nearest deadlines from `public.tasks` / `public.daily_plan_tasks`. |
| **Due Soon** | `getUpcomingTasks(4)` | Open tasks with `due_date is not null` ordered by `due_date asc`. |
| **Recent Focus** | `getRecentSessions(4)` | Last 4 completed sessions from `public.focus_sessions`. |

---

## 6. Verification & Testing Results

### A. Automated Typecheck & Production Build (Executed)

Commands run in workspace:
```bash
npm run typecheck --workspace=@focusgate/web
npm run build --workspace=@focusgate/web
```
- **TypeScript (`tsc --noEmit`):** Passed with `0` errors.
- **Next.js Production Build (`next build`):** Compiled and statically/dynamically validated all routes (`/`, `/tasks`, `/planner`, `/focus`, `/wallet`, `/statistics`) with `0` warnings or errors.

### B. Responsive & Accessibility Audit (Source & Layout Verification)

- **1440×900 & 1280×800 (Desktop / Laptop):** `max-w-[1200px]` container with `250px` sticky sidebar; 3 equal-height stat cards in a single row (`lg:grid-cols-3`); 2-column main grid (`minmax(0,1.95fr)` Mission Card + `minmax(320px,1fr)` Reward Wallet Card); 2-column supporting grid (`NextMoveCard` + `Due Soon` on left, `Recent Focus` on right).
- **1024×768 & 768×1024 (Tablet Landscape / Portrait):** Below `lg` (`<1024px`), the sidebar collapses into the sticky top bar + bottom `MobileNav`; stat cards flow into a 2-column grid (`sm:grid-cols-2`, with the 3rd card spanning full width cleanly); `DailyMissionCard` and `RewardWalletCard` stack vertically without horizontal overflow.
- **390×844 & 360×800 (Mobile):** Single-column layout (`px-4 py-7`); the 5-stage journey rail stacks into compact horizontal step rows (`flex items-start gap-2.5`) so labels never truncate or overflow horizontally; touch targets meet `>= 40–48px` height.
- **Accessibility:** Single `h1` in `PageHeader`, semantic `<section aria-label="...">` landmarks, `<ol aria-label="FocusGate daily journey">` with `aria-current="step"`, `role="progressbar"` with `aria-valuenow/min/max`, and keyboard focus trapping on all confirmation dialogs.

### C. Known Limitations / Boundaries Respected

- **Live Browser Screenshot Capture:** The local Chrome instance in this environment does not currently have `chrome://inspect/#remote-debugging` enabled (`DevToolsActivePort` absent), so visual verification was performed via production build verification and live local server (`http://localhost:3000`).
- **No Schema or Business Rule Changes:** Per milestone constraints, no SQL migrations, RPC signatures, or reward calculation rules were modified.
