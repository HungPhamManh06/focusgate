# FocusGate — Dashboard 2.0.2: Final UX Polish Report

## 1. Summary of UX Problems Fixed

Following the **"Less duplication. More clarity. One obvious next action."** principle, Milestone 2.0.2 resolves the remaining visual density and redundancy issues identified in the Dashboard 2.0.1 screenshots:

1. **P1 — Simplified `Today's Mission` Connected Stepper:**
   - *Before:* Each of the 5 steps rendered a multi-line card with a subtitle (`"Choose your Mus..."`, `"Complete verified..."`) that truncated on desktop and repeated the guidance already shown in the step detail panel below.
   - *After:* Replaced the 5 multi-line boxes with a clean horizontal connected stepper (`01 Plan ━━ 02 Commit ━━ 03 Focus ━━ 04 Complete ━━ 05 Unlock`). Each step pill displays only: **Status Icon** (`Check` for completed, stage icon for current, `Lock` for upcoming), **Step Number (`01`–`05`)**, and **Step Label** (`whitespace-nowrap` so labels never truncate), linked by progress connector lines.

2. **P1 — Streamlined Empty State in `Today's Mission` (Draft Without Must-do):**
   - *Before:* When a draft plan had 0 Must-do tasks, the card simultaneously displayed 4 separate elements explaining the exact same empty state: a dashed circle (`"No Must-do tasks yet"`), a `"Verified focus coverage: Focus target not set"` box, a `"No tasks selected in this draft yet"` box, and the footer CTA.
   - *After:* Consolidated into **one single, focused empty state** under `STEP 01 · PLAN`:
     - Heading: **`No Must-do tasks yet.`**
     - Copy: *"Choose at least one important task to establish today's commitment."*
     - Status pill: `0 Must-do tasks selected`
     - Primary CTA: `[Add tasks to today's plan]`
     - Both the empty progress circle and `Verified focus coverage` box are hidden until at least one Must-do task is selected.
     - When Must-do tasks exist but `focusRequired === 0`, renders `"Focus target not set. Add required focus minutes to your Must-do task in the planner."` without any `0%` progress bar.
     - When `focusRequired > 0`, renders `"Verified focus coverage — X / Y minutes completed"` with the progress bar.

3. **P1 — Task De-duplication Between `Your Next Move` and `Due Soon`:**
   - *Before:* `"Ship the FocusGate landing page"` appeared as the recommended task in `Your Next Move` and immediately appeared again as the first row in `Due Soon`.
   - *After:* Added `filterDueSoonTasks(upcomingTasks, nextMove?.task.id, 4)` in `apps/web/lib/domain/dashboard-state.ts`. `DashboardPage` fetches up to 5 upcoming tasks with deadlines and excludes the task already promoted to `Your Next Move`, displaying up to 4 distinct remaining tasks in `Due Soon` (e.g., `"Write the weekly product brief"` and `"Review the open pull requests"`).

4. **P1 — Eliminated Duplicate Header & Mission CTAs:**
   - *Before:* In Draft state, the Greeting Header displayed `"Continue planning"` while `Today's Mission` displayed `"Add tasks to today's plan"`, creating two competing buttons on the same screen that navigated to `/planner`.
   - *After:* The Greeting Header now focuses purely on the date eyebrow, editorial greeting (`"Good afternoon, Alex."`), and guiding subtitle, while **the single authoritative Primary CTA lives inside `Today's Mission`**.

5. **P2 — Simplified `Reward Wallet` When No Active Grants Exist:**
   - *Before:* When active grants were `0`, the bottom box inside `Reward Wallet` showed `"Next expiration"`, a `"No active grants"` badge, and `"No active grants. Previous grants have expired..."` — repeating `"No active grants"` twice inside an empty expiration container.
   - *After:* When `nextExpiringGrant` exists, the `Next expiration` panel renders the active grant count badge, remaining minutes, and expiration timestamp. When no active grants exist, the `Next expiration` header is hidden and replaced by a single clean status notice:
     - *"No active grants. Previous rewards have expired. Complete today's plan to earn a fresh grant."*

6. **P2 — Sidebar Wallet & Desktop Container Optimization:**
   - **Sidebar:** Displays strictly `AVAILABLE TIME`, the authoritative balance (`0m`), and `Open wallet ↗`, sharing the exact same balance source as `RewardWalletCard` without repeating `Earned`, `Spent`, or `Expired`.
   - **Desktop & Mobile Layout:** Adjusted main container to `max-w-[1220px]` with `min-w-0` flex protection in `AppLayout` (`apps/web/app/(app)/layout.tsx`), eliminating horizontal overflow across all desktop, tablet, and mobile viewports (`scrollWidth === innerWidth` verified across all 6 viewports).

---

## 2. Mission Stepper & Empty State Architecture

### Connected 5-Stage Stepper (`apps/web/components/domain/daily-mission-card.tsx`)

```text
TODAY'S MISSION   [Draft]                                    Step 01 of 05 · Plan
┌───────────┐      ┌─────────────┐      ┌────────────┐      ┌───────────────┐      ┌─────────────┐
│ (Icon) 01 │ ──── │ (Lock)  02  │ ──── │ (Lock)  03 │ ──── │  (Lock)   04  │ ──── │ (Lock)  05  │
│      Plan │      │      Commit │      │      Focus │      │      Complete │      │      Unlock │
└───────────┘      └─────────────┘      └────────────┘      └───────────────┘      └─────────────┘
```

- **Completed stage:** Green check badge (`bg-success text-white`), subtle green border/fill (`border-success/30 bg-success-soft/50`), green connector bar (`bg-success/55`).
- **Current stage:** Cobalt blue icon badge (`bg-accent text-white`), prominent accent border (`border-accent bg-accent-soft/85`), high-contrast accent step number and label, `aria-current="step"`.
- **Upcoming / Locked stage:** Neutral surface (`border-line bg-surface`), lock icon (`Lock`), full text legibility without low-contrast opacity fade.

---

## 3. Task Selection & De-duplication Logic (`apps/web/lib/domain/dashboard-state.ts`)

1. **`selectNextMoveFromTasks(openTasks, plan)`:**
   - Filters strictly to open tasks (`status === "todo" || status === "in_progress"`).
   - **Priority 1:** Unfinished `must_do` tasks in today's active/confirmed/draft plan (ordered by nearest due date, then priority).
   - **Priority 2:** Unfinished `must_do` tasks in the open backlog with overdue / nearest due date.
   - **Priority 3:** Remaining unfinished `must_do` tasks by priority (`urgent → high → medium → low`).
   - **Priority 4:** Unfinished `should_do` tasks when no `must_do` remains open.
   - **Priority 5:** Unfinished `bonus` tasks only when no `must_do` tasks remain open.
2. **`filterDueSoonTasks(upcomingTasks, nextMoveTaskId, 4)`:**
   - Filters open tasks that have a `dueDate`, removes the task matching `nextMoveTaskId`, and slices to at most `4` items.
   - Guarantees zero task duplication between `Your Next Move` and `Due Soon`.

---

## 4. CTA Mapping by Plan State

| Plan Phase | Condition | Mission Current Step | Primary CTA in `Today's Mission` | Secondary CTA |
| :--- | :--- | :--- | :--- | :--- |
| **`no_plan`** | `plan === null` | `Step 01 · Plan` | `Create today's plan` | — |
| **`draft_empty`** | `draft` (`mustDoTotal === 0`) | `Step 01 · Plan` | `Add tasks to today's plan` | — |
| **`draft_ready`** | `draft` (`mustDoTotal > 0`) | `Step 02 · Commit` | `Confirm plan` | `Edit plan` |
| **`confirmed`** | `confirmed` | `Step 02 · Commit` | `Activate focus` | `View plan` |
| **`active_focus`** | `active` (work/focus left) | `Step 03 · Focus` (or `04 Complete`) | `Go to focus` | `View plan` |
| **`active_ready_to_close`** | `active` (all Must-dos & focus met) | `Step 04 · Complete` | `Complete day` | `View plan` |
| **`completed_unclaimed`** | `completed` (`!todayGrant`) | `Step 05 · Unlock` | `Claim reward` | `View summary` |
| **`completed_claimed`** | `completed` (`Boolean(todayGrant)`) | `Step 05 · Unlock` | `View wallet` | `Review today's progress` |

---

## 5. Responsive & Visual Regression Verification

Headless Chrome CDP screenshots were captured before (`dashboard_before_*.png`) and after (`dashboard_after_*.png`) across all 6 required viewports, accompanied by automated DOM `scrollWidth` vs. `innerWidth` checks:

| Device / Viewport | Dimensions | Document `innerWidth` | Document `scrollWidth` | Horizontal Overflow | Verification Result |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Desktop** | `1440 × 900` | `1440px` | `1440px` | `false` | 5-step connected rail fits on one line with zero label truncation; `Your Next Move` shows `"Ship the FocusGate landing page"` while `Due Soon` shows `"Write the weekly product brief"` (no duplicate). |
| **Laptop** | `1280 × 800` | `1280px` | `1280px` | `false` | Balanced 2-column Mission (`~66%`) + Reward Wallet (`~34%`) proportions. |
| **Tablet Landscape** | `1024 × 768` | `1024px` | `1024px` | `false` | Sidebar + 3-column Daily Overview + 2-column Mission/Wallet fit cleanly without cramping. |
| **Tablet Portrait** | `768 × 1024` | `768px` | `768px` | `false` | Sidebar collapses to top bar + bottom nav; 2-column stat cards; Mission and Wallet stack full-width. |
| **Mobile** | `390 × 844` | `390px` | `390px` | `false` | Zero page horizontal overflow; Mission stepper scrolls horizontally inside its padded rail; full-width touch-friendly CTA buttons. |
| **Small Mobile** | `360 × 800` | `360px` | `360px` | `false` | Zero page horizontal overflow; cards, badges, and 3-column wallet stats remain legible and well-aligned. |

---

## 6. Automated Test, Typecheck & Build Results

```text
> npm test --workspace=@focusgate/web
✔ Mission stepper and empty state mapping across all plan states
✔ Your Next Move selection and Due Soon de-duplication prevent a task from appearing twice
✔ Reward wallet summary handles both active grants and expired-only grants cleanly
ℹ tests 3 | pass 3 | fail 0

> npm run typecheck
tsc --noEmit (0 errors across @focusgate/web and @focusgate/shared-contracts)

> npm run build -w @focusgate/web
✓ Compiled successfully
✓ Generating static pages (3/3)
```

---

## 7. Known Boundaries Respected

- Zero changes to database schema, SQL migrations, RPCs, task lifecycle, focus session validation, or reward calculation formulas.
- No fake data, hardcoded task titles, or invented streak metrics were introduced.
