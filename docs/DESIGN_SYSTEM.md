# FocusGate Design System

Modern Productivity SaaS: quiet canvas, editorial type, one decisive accent, and
dense-but-breathable data. The interface should feel like a well-made tool, not a
dashboard template.

Source of truth: `apps/web/app/globals.css` (tokens) and `apps/web/components/ui/*`
(primitives). All screens compose these primitives; no screen invents its own
button, input, badge or surface.

## 1. Principles

1. **One gate, one action.** Every screen has a primary next step. Secondary
   actions are outlined or ghosted.
2. **Calm over colour.** Warm paper canvas, white cards, near-black ink. Cobalt is
   reserved for action and focus, never decoration.
3. **Editorial hierarchy.** Instrument Serif carries page titles and large
   numbers. Inter carries everything operational.
4. **Numbers are honest.** Money-like figures use tabular numerals; reward state
   always shows source, expiry and remaining minutes.
5. **Quiet motion.** 150–250 ms for interaction, up to 700 ms for progress
   transitions. No looping decoration except the live-focus pulse.

## 2. Colour tokens

Defined as CSS custom properties in `:root` / `.dark`, exposed to Tailwind via
`@theme inline`.

| Token | Light | Dark | Use |
|---|---|---|---|
| `canvas` | `#f4f4f0` | `#0b0c10` | App background |
| `surface` | `#ffffff` | `#121318` | Cards, inputs, sidebar |
| `surface-2` | `#fafaf7` | `#17181f` | Inset panels, hover fills |
| `ink` | `#14151a` | `#f2f2ed` | Primary text, primary button |
| `ink-soft` | `#3b3e47` | `#d4d5dc` | Secondary text |
| `muted` | `#70747d` | `#8d909b` | Meta text, labels |
| `line` | `#e5e4de` | `#262830` | Borders, dividers, tracks |
| `accent` | `#2b59ff` | `#809dff` | Primary action, focus, links |
| `accent-strong` | `#1e43d6` | `#b3c4ff` | Accent hover |
| `accent-soft` | `#e9eeff` | `#1a2340` | Selected nav, tinted callouts |
| `success` | `#0d7a58` | `#5dd6ab` | Valid focus, completed, earned |
| `success-soft` | `#e2f3ec` | `#112a24` | Success fills |
| `warning` | `#9a5b08` | `#e2a552` | Draft, below-minimum, expiring |
| `warning-soft` | `#fbf0de` | `#2b2011` | Warning fills |
| `danger` | `#bf3a32` | `#ff8f86` | Destructive actions, errors |
| `danger-soft` | `#fbe9e7` | `#2c1715` | Error fills |

Rules:

- Body text is `ink`; supporting copy uses `muted`.
- Never place `accent` text on `accent`; use `accent-soft` surfaces.
- Primary buttons use `ink` on `canvas`, except the main CTA in a screen hero,
  which uses `accent` with white text.
- Dark mode is a token swap, not a separate stylesheet. It is applied by the
  `dark` class on `<html>` and bootstrapped before paint to avoid a flash.

## 3. Typography

- UI / body: **Inter Variable**, feature settings `cv11`, `ss01`, tabular
  numerals.
- Display: **Instrument Serif** 400. Used only for page titles, hero headings and
  large metric values.
- Both are self-hosted via Fontsource; no runtime font requests.

| Role | Family | Size / line-height | Notes |
|---|---|---|---|
| Display XL | Instrument Serif | 38 → 46 px / 1.02 | Page titles |
| Display L | Instrument Serif | 34–36 px / 1 | Section heroes, metric cards |
| Display metric | Instrument Serif | 46–60 px / 0.95 | Wallet and timer numbers |
| Card title | Inter | 15 px / 1.3 | Semibold, `-0.01em` |
| Body | Inter | 13.5 px / 1.6 | Default reading size |
| Small | Inter | 11.5–12 px / 1.5 | Meta, helper copy |
| Label | Inter | 10.5 px / 1.2 | Uppercase, `0.16em`, 600 |
| Button | Inter | 13–15 px / 1 | Medium weight |

Use the `.label-xs` utility for section eyebrows. Never use Instrument Serif for
body copy or buttons.

## 4. Spacing, radius, elevation

- Base unit: **4 px**. Common steps: 8, 12, 16, 20, 24, 32, 40, 48.
- Page frame: `max-width: 1180px`; padding 20 px mobile, 32 px from `sm`;
  vertical padding 32–40 px.
- Section rhythm: 16 px between related cards, 24–32 px between sections.
- Radii: inputs/buttons 12 px (controls are pills at full height); cards 18 px;
  dialogs 22 px; badges and progress tracks 999 px.
- Elevation: `shadow-card` for resting cards, `shadow-lift` for dialogs and
  toasts. Borders carry most separation; shadows stay subtle.

## 5. Components

### Buttons (`components/ui/button.tsx`)

| Variant | Surface | Text | Use |
|---|---|---|---|
| `primary` | `ink` | `canvas` | Default transactional action |
| `accent` | `accent` | white | Main CTA / start focus / claim |
| `outline` | `surface` + `line` | `ink` | Secondary action |
| `ghost` | transparent | `ink-soft` | Tertiary / cancel |
| `subtle` | `accent-soft` | `accent` | Inline emphasis |
| `danger` | `danger-soft` | `danger` | Delete / reversible destructive |

Sizes: `sm` 36 px, `md` 40 px, `lg` 48 px, `icon` 36 px square. All buttons are
pill-radii, have a visible focus ring, and disable with 45% opacity plus a spinner
when pending.

### Cards

`surface-card` = surface + 1 px line + 18 px radius + `shadow-card`. Use
`CardHeader` / `CardContent` / `CardFooter` for rhythm. Cards never nest inside
other cards except tinted inset blocks with `surface-2`.

### Inputs

Height 44 px, 12 px radius, 1 px `line`, `surface` background, 4 px
`accent/10` focus ring. Labels are 12 px medium; hints 11.5 px muted. Selects use
the same shell with a chevron; textareas share the field styles and resize
vertically.

### Badges

Pill, 11 px, 600. Tones: neutral, accent, success, warning, danger, outline.
Domain mapping: Must-do = accent, Should-do = neutral, Bonus = warning, Draft =
warning, Confirmed = accent, Active = success with dot, Completed = neutral.

### Progress

- Linear: 6 px track, rounded, `accent` / `success` / `warning` / `ink`.
- Ring: SVG, 7–9 px stroke, used for daily gate progress and the live focus timer.
- Values are clamped 0–100 and exposed with `role="progressbar"`.

### Stat cards

`label-xs` label, 34 px display value, 11.5 px hint, optional 28 px tinted icon.
Four across at `xl`, two at `sm`, one on mobile.

### Empty, loading and error states

- `EmptyState`: dashed border, 44 px accent-tinted icon, title, one-sentence
  explanation, optional primary action.
- `PageSkeleton`: page-shaped shimmer used by every route `loading.tsx`.
- `app/(app)/error.tsx`: client error boundary with retry and dashboard escape.
- Toasts: bottom-right desktop / above mobile nav; success, error and info; max
  three, auto-dismiss 4.8 s.

### Navigation

- Desktop: 250 px sticky sidebar, logo, six destinations, live unlocked-time
  card, user + theme toggle. Active item uses `accent-soft` with accent text.
- Mobile: 64 px sticky top bar (logo, balance, theme) and six-item bottom tab bar
  with safe-area padding. Content bottom padding is 96 px.
- Primary destinations: Dashboard, Tasks, Planner, Focus, Wallet, Statistics.

### Dialogs

Used for task create/edit. Max width 560 px, bottom sheet on mobile, centred card
on desktop, overlay `ink/35` with 2 px blur, ESC and overlay click close, focus
returns to trigger. Errors render inline above the fields.

## 6. Responsive breakpoints

| Name | Width | Behaviour |
|---|---|---|
| base | 0–639 | Single column, mobile top/bottom nav, bottom-sheet dialog |
| `sm` | ≥ 640 | Two-column stat grids, two-up forms, centred dialog |
| `lg` | ≥ 1024 | Sidebar appears, two/three-column screen grids, sticky aside |
| `xl` | ≥ 1280 | Four stat cards per row, full content width |

The page frame is fluid below 1180 px. Charts scroll horizontally only when the
period is 90 days; cards never force horizontal page scroll.

## 7. Screen compositions

| Screen | Primary block | Supporting blocks |
|---|---|---|
| Dashboard | Today's gate progress + actions | 4 stats, reward wallet, due soon, recent focus |
| Tasks | Grouped must-do / should-do / bonus list | Counts, status tabs, type filters, search |
| Planner | Plan tasks + gate lifecycle stepper | Gate summary, backlog add, event history |
| Focus | Live timer or session starter | Today's focus stats, plan coverage, session log |
| Wallet | Available balance + active grants | Earned/spent stats, spend form, ledger, usage |
| Statistics | Focus rhythm chart | Period selector, 4 stats, consistency, entertainment, daily table |

Every data screen implements: loading (route skeleton), empty (filtered or
zero-state with an action), error (shared boundary) and populated states.

## 8. Motion

- Colour/hover: 150 ms ease.
- Progress width and ring: 500–700 ms ease-out.
- Live focus dot: 1 s ping; the only infinite animation.
- No page-transition choreography. Respect
  `prefers-reduced-motion` at the platform level by avoiding essential motion.

## 9. Accessibility

- Semantic landmarks (`aside`, `header`, `main`, `nav`), one `h1` per page.
- Visible `:focus-visible` ring using the accent colour.
- Icon-only controls always carry `aria-label`; progress and toggle states expose
  ARIA roles/values.
- Colour is never the only signal: badges pair tone with text; focus validity has
  a label; errors include text.
- Contrast: ink/muted on canvas and white on accent meet AA for their sizes;
  muted is reserved for secondary meta text.

## 10. File map

```
apps/web/app/globals.css              tokens, dark mode, utilities
apps/web/components/ui/               button, card, input, badge, progress,
                                      stat-card, empty-state, skeleton, toast,
                                      action-button, page-header, logo, theme
apps/web/components/shell/            sidebar, mobile nav, nav config
apps/web/components/domain/labels.tsx domain badge/label mappings
apps/web/components/charts/           bar chart, tiny bars
apps/web/app/(app)/                   six screens + loading/error states
```
