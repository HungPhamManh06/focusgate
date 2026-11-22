# FocusGate — Dashboard 2.0.4: Final Layout & Recommendation Polish Report

## 1. Summary of Changes Implemented

Following the **"Make task status obvious. Make recommendations actionable. Keep the layout balanced."** principle, Milestone 2.0.4 resolves the four remaining issues on the FocusGate Web Dashboard:

1. **P1 — Clear Distinction Between Committed Plan Tasks and Backlog Candidates in `Your Next Move`:**
   - *Before (2.0.3 Baseline):* When `Today's Mission` showed `0 Must-do tasks selected` (Draft Empty), `Your Next Move` recommended `"Ship the FocusGate landing page"` with a blue `Must-do` badge, making an unscheduled backlog task look as if it had already been committed to today's plan.
   - *After (2.0.4 Final):*
     - **Case A — Task already belongs to Today's Plan (`origin: "today_plan"`):**
       - Card subtitle: `Committed priority task`
       - Header badge: `Today's plan · Must-do` (`accent` blue for Must-do, `neutral` for Should-do, `warning` for Bonus).
       - Inner eyebrow: `TODAY'S PLAN · MUST-DO`
       - Rationale: *"Suggested because this is your highest-priority unfinished commitment."*
       - CTA: `[View task →]`
     - **Case B — Task is in Backlog only (`origin: "backlog"`):**
       - Card subtitle: `Suggested from backlog`
       - Header badge: `Backlog · Suggested` (`neutral` tone — never uses the blue Must-do commitment badge for an unscheduled task).
       - Inner eyebrow: `BACKLOG · SUGGESTED`
       - Rationale: *"This task is a strong candidate for today's Must-do commitment."*
       - Primary CTA (when plan is `null` or `draft`): **`[+ Add to today's plan]`** alongside a secondary `View task →` link.

2. **P1 — Real Server Action for `Add to today's plan` Respecting Daily Commitment Rules:**
   - Added `addSuggestedTaskToTodayPlanAction({ planId, taskId, kind })` in `apps/web/lib/actions/planner.ts`.
   - Reuses the existing `ensureTodayPlan()` (`rpc_create_daily_plan`) and `addPlanTask()` (`rpc_add_plan_task`) data layer functions and calls `revalidateWorkspace()`:
     - **When plan is `null` or `draft`:** Creates today's draft plan if needed, verifies ownership and non-completed status via `rpc_add_plan_task`, prevents duplicates (`on conflict (plan_id, task_id) do nothing`), shows loading spinner (`Adding…`) and toast feedback via `ActionButton`, and immediately revalidates the Dashboard so the task transitions from `Backlog · Suggested` to `Today's plan · Must-do`.
     - **When plan is `confirmed` or `active`:** Never allows silent modification of locked commitments (`ctaKind: "view_plan"` renders `View today's plan →` instead of `Add to today's plan`).
     - **When plan is `completed`:** Renders `View task →` (`ctaKind: "view_task"`).

3. **P1 — Balanced `Recent Focus` Desktop Height:**
   - *Before:* `Recent Focus` ended above the bottom of the left column (`Your Next Move` + `Due Soon`), leaving an uneven empty gap at the bottom-right of the Dashboard.
   - *After:* In `apps/web/app/(app)/page.tsx`, the Supporting Information section uses `lg:grid-cols-2 lg:items-stretch`. The left column stacks `NextMoveCard` and `Due Soon` (`flex flex-col gap-5` with `flex-1` on `Due Soon`), while `Recent Focus` on the right uses `flex flex-col lg:h-full` with `flex-1` content and `mt-auto` on its footer (`"Sessions require at least 1m on the server clock to count toward a Must-do task."`).
   - Both columns now align cleanly at the top and bottom edges on desktop (`1024px–1920px`), while reverting to natural content height on tablet portrait and mobile (`<1024px`).

4. **P2 — Explicit Per-Tier Breakdown in `Open Tasks` Stat Card:**
   - *Before:* Displayed `2 must-do · 2 should-do & bonus →`, combining Should-do and Bonus counts into a single ambiguous number.
   - *After:* Added `formatOpenTasksStat(counts)` in `apps/web/lib/domain/dashboard-state.ts` using the authoritative `getTaskCounts()` query (`mustDoOpen`, `shouldDoOpen`, `bonusOpen` from `public.tasks where status in ('todo', 'in_progress')`).
   - Now displays: **`2 Must-do · 1 Should-do · 1 Bonus →`** (always summing to the total `4` open tasks).

---

## 2. Backlog vs. Today's Plan Comparison Matrix

| Attribute | Case A: Committed in Today's Plan | Case B1: Backlog Candidate (No Plan / Draft) | Case B2: Backlog Candidate (Locked Plan) |
| :--- | :--- | :--- | :--- |
| **`origin`** | `"today_plan"` | `"backlog"` | `"backlog"` |
| **Card Header Title** | `Committed priority task` | `Suggested from backlog` | `Suggested from backlog` |
| **Header Badge** | `Today's plan · Must-do` (`accent` blue) | `Backlog · Suggested` (`neutral`) | `Backlog · Suggested` (`neutral`) |
| **Inner Eyebrow** | `TODAY'S PLAN · MUST-DO` | `BACKLOG · SUGGESTED` | `BACKLOG · SUGGESTED` |
| **Primary CTA** | `View task →` | `+ Add to today's plan` (Server Action) | `View today's plan →` |
| **Secondary Link** | — | `View task →` | `View task →` |

---

## 3. Responsive & Visual Regression Verification

Headless Chrome CDP screenshots (`dashboard_v204_after_*.png`) and DOM overflow checks (`window.innerWidth === document.documentElement.scrollWidth`) were executed across all 7 required viewports:

| Device Class | Viewport | `innerWidth` | `scrollWidth` | Horizontal Overflow | Verification Result |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Large Desktop** | `1920 × 1080` | `1920px` | `1920px` | `false` | Centered `1280px` content container with `40px` horizontal padding; `Open Tasks` shows `2 Must-do · 1 Should-do · 1 Bonus →`; `Your Next Move` shows `Backlog · Suggested` + `[+ Add to today's plan]`; `Due Soon` and `Recent Focus` bottom edges align at the exact same pixel row. |
| **Desktop** | `1440 × 900` | `1440px` | `1440px` | `false` | Balanced 2-column Mission/Wallet and equal-height Supporting columns. |
| **Laptop** | `1280 × 800` | `1280px` | `1280px` | `false` | Clean 3-column stat row and 2-column supporting row without text clipping. |
| **Tablet Landscape** | `1024 × 768` | `1024px` | `1024px` | `false` | Desktop 2-column supporting grid fits cleanly with equal bottom alignment. |
| **Tablet Portrait** | `768 × 1024` | `768px` | `768px` | `false` | Collapses to single-column stack; `Recent Focus` uses natural auto height (`lg:h-full` applies only at `>=1024px`). |
| **Mobile** | `390 × 844` | `390px` | `390px` | `false` | Zero horizontal overflow; `[+ Add to today's plan]` and `View task →` have generous touch spacing; `Recent Focus` stacks naturally at the bottom. |
| **Small Mobile** | `360 × 800` | `360px` | `360px` | `false` | Zero horizontal overflow; `2 Must-do · 1 Should-do · 1 Bonus →` and all badges fit cleanly without truncation. |

---

## 4. Automated Test, Typecheck & Build Results

```text
> npm test --workspace=@focusgate/web
✔ Mission stepper and empty state mapping across all plan states
✔ Your Next Move clearly distinguishes Backlog vs Today's Plan and adapts CTA by plan lock state
✔ Open Tasks stat formatting explicitly separates Must-do, Should-do, and Bonus counts
✔ Reward wallet summary handles both active grants and expired-only grants cleanly
ℹ tests 4 | pass 4 | fail 0

> npm run typecheck
tsc --noEmit (0 errors across @focusgate/web and @focusgate/shared-contracts)

> npm run build -w @focusgate/web
✓ Compiled successfully
✓ Linting and checking validity of types
✓ Generating static pages (3/3)
```

---

## 5. Known Boundaries Respected

- Zero modifications to database schema, SQL migrations, RPC definitions, focus session validation, or reward calculation rules.
- `addSuggestedTaskToTodayPlanAction` delegates 100% of persistence and validation to existing PostgreSQL RPCs (`public.rpc_create_daily_plan` and `public.rpc_add_plan_task`).
