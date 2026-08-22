# FE UI Polish & Visual Consistency

## Status

Proposed. This spec covers a visual polish pass across the existing frontend.
It does not change product behavior or backend contracts.

## 1. Problem

The frontend already has a useful visual foundation: Be Vietnam Pro, Tailwind,
shadcn-style primitives, Lucide icons, Casso green, semantic status colors, and
responsive layouts. The experience still feels sparse and inconsistent because:

- the authenticated shell lets page content stretch across the full desktop
  width (`apps/frontend/src/components/layout/app-layout.tsx`);
- the base Card has generous padding and gaps (`components/ui/card.tsx`),
  which makes low-content sections look empty;
- `PageHeading`, `PageHeader`, and hand-built page headers use different visual
  contracts;
- icons and semantic color are strong on Dashboard but underused on CRUD,
  settings, reports, and admin screens;
- empty, loading, and error states are often plain text instead of providing
  visual context and a next step;
- page-level spacing is not consistently composed, with some screens stacking
  `space-y-6`, `p-6`, and the Card defaults at the same time.

## 2. Goals

1. Make desktop layouts feel intentional and balanced without filling space
   with decorative noise or fake data.
2. Establish one visual contract for page titles, descriptions, icons, actions,
   cards, tables, and empty states.
3. Use color as information: brand, success, info, warning, danger, and AI
   accents must have stable meanings.
4. Improve scanability of finance data through density, numeric alignment,
   section hierarchy, and clear state treatments.
5. Preserve responsive behavior, keyboard focus, reduced-motion behavior,
   existing URLs, permissions, API calls, and business behavior.

## 3. Non-goals

- No backend, API, domain, database, or routing changes.
- No new UI library, font dependency, chart library, or icon library.
- No invented data to make an empty page look full.
- No product copy rewrite beyond labels needed to clarify hierarchy or empty
  state next steps.
- No full dark-mode redesign; existing dark mode remains supported and must
  receive equivalent semantic color treatment.
- No redesign of the landing page into a separate brand system; it keeps its
  current marketing direction while sharing typography and accessibility rules.

## 4. Visual direction

The product direction is a calm “collection cockpit”: a light, finance-oriented
workspace with clear colored signals for money movement and risk. The base stays
quiet; color appears where it carries meaning.

### Palette

Use existing CSS variables wherever possible. Add only the missing surface
tints needed for the shell and state wells.

| Role | Target | Usage |
| --- | --- | --- |
| Canvas | `#F6FBF8` | Authenticated app background |
| Card | `#FFFFFF` | Primary content surfaces |
| Ink | `#173026` | Headings and important values |
| Casso green | `#16AB64` | Primary actions, healthy/active state |
| Info blue/teal | `#3B82F6` / existing info token | Connected, informative, neutral progress |
| Warning amber | `#D97706` / existing warning token | Due soon, attention needed |
| Danger coral | existing destructive token | Overdue, failed, destructive action |
| AI violet | `#7C3AED` | Copilot-only identity |

Do not color every Card. Use a soft 5–10% tint, a small icon well, or a thin
semantic rail for emphasis. Keep body text readable on all fills.

### Typography and hierarchy

- Keep Be Vietnam Pro; do not add another font.
- Page heading: eyebrow → balanced `h1` → one short description → actions.
- Section heading: optional icon → title → short description.
- Values: larger, semibold/bold, `tabular-nums` for money and counts.
- Descriptions: muted, readable, and limited to one or two lines where layout
  needs density.
- Use `…`, sentence-case Vietnamese copy, and active action labels.

### Signature element

Every major page gets a small domain-colored icon well next to its title. KPI
and state cards reuse the same semantic tone through a subtle border rail or
surface tint. This creates a recognizable Casso Ledger rhythm without turning
the interface into a rainbow dashboard.

## 5. Shared foundation changes

### 5.1 App shell and content width

- Add a centered content container to the authenticated main area with a
  practical desktop ceiling (target `max-w-[1600px]`).
- Keep `Copilot` and other intentionally full-height workspaces able to opt out
  of the normal content container.
- Use the existing responsive padding, tightening small screens and adding
  only enough large-screen breathing room to preserve a readable measure.
- Keep the skip link, overflow behavior, mobile header, sidebar collapse, and
  theme toggle unchanged functionally.

### 5.2 Page headings

- Make `PageHeading` the default contract for standalone authenticated pages.
- Keep `PageHeader` only where its sticky settings behavior is required, but
  align its type scale, icon well, action alignment, and spacing with
  `PageHeading`.
- Add a small tone prop to the shared icon treatment instead of hardcoding
  page-specific color classes in every screen.
- Migrate hand-built page headings (notably admin organization members) to the
  shared contract when the behavior is equivalent.

### 5.3 Cards and density

- Reduce the default visual bulk of sparse Cards without removing the existing
  Card primitive.
- Use three explicit density patterns in page code: compact for KPIs/toolbars,
  normal for sections, and spacious only for onboarding/marketing moments.
- Avoid stacking a page `p-6` wrapper, Card `py-6`, and another `p-6` content
  wrapper unless the section genuinely needs it.
- Keep the existing radius family and use softer borders/shadows so hierarchy
  comes from grouping rather than heavy outlines.

### 5.4 Empty and state surfaces

Create one small shared `EmptyState` primitive for repeated empty arrays and
no-result screens. It supports:

- a decorative Lucide icon with `aria-hidden="true"`;
- a concise title;
- an optional explanation;
- an optional existing action/CTA;
- compact and regular density variants.

Use it for customers, receivables, bank connections, reminders, reports,
activities, tasks, drafts, and charts where the current state is empty. Keep
loading and error states separate: loading uses skeletons or a live status,
error includes a recovery action when the query exposes one.

### 5.5 Data surfaces

- Give table headers a quiet tinted background and stronger column hierarchy.
- Keep identifiers and long customer names constrained with `min-w-0`,
  `truncate`, or `break-words`.
- Right-align or visually group money/count columns and keep `tabular-nums`.
- Use row hover/focus states consistently without adding interaction to static
  rows.
- Group filters and primary actions into one responsive toolbar surface where
  the page currently leaves them floating separately.

## 6. Page rollout matrix

### Wave 1 — shared shell and high-traffic finance pages

| Area | Main improvements |
| --- | --- |
| App shell/sidebar | Content ceiling, canvas tint, active nav/icon treatment, tighter footer balance |
| Dashboard | More deliberate welcome block, colored KPI semantics, balanced chart grid, richer no-data states |
| Customers | Search toolbar grouping, table empty state, compact pagination, detail card hierarchy |
| Receivables | Toolbar grouping, status filter colors, table density, preserve the recent detail-page polish |
| Reports | Compact summary/KPI row, consistent chart section headers, empty states for filters/results |

### Wave 2 — operations and history

| Area | Main improvements |
| --- | --- |
| Bank connections | Connection-state color/tone, stronger empty state, compact table/dialog spacing |
| Exceptions | Pending-review emphasis, readable empty state, action hierarchy for match/split flows |
| Reminders | Separate policy vs execution sections visually, icon-backed empty states, consistent tables |
| Receivable balance history | Remove nested excess padding, unify KPI/chart/table surfaces, clarify filters |
| Settings | Align PageHeader with the shared heading contract, color tabs and section icons semantically |

### Wave 3 — secondary and edge surfaces

| Area | Main improvements |
| --- | --- |
| Copilot | Keep the violet AI accent limited to Copilot, improve welcome/empty/draft states, preserve full-height chat layout |
| Admin | Shared headings, consistent card density, clear usage/no-data states, keep admin permissions and routes intact |
| Auth/onboarding | Stronger brand surface and step hierarchy without changing auth flow or validation |
| Landing/not-found | Keep marketing identity, fix spacing/accessibility issues, improve visual rhythm only where it serves the page |

## 7. Implementation constraints

- Work directly on the user-selected `main` worktree.
- Reuse installed Tailwind, shadcn primitives, Lucide icons, and existing CSS
  variables.
- Do not add a component abstraction for a single use. Shared primitives are
  justified only where the audit found the same state/pattern in three or more
  places.
- Preserve existing public component behavior and update tests when a shared
  component gains a visual prop or new state variant.
- Keep all user-visible copy Vietnamese unless the current product intentionally
  uses a brand/product term such as Copilot.

## 8. Accessibility and quality bar

- Decorative icons are hidden from assistive technology; icon-only actions have
  accessible labels.
- Headings remain hierarchical and descriptions remain associated with their
  sections.
- Focus-visible styles remain visible on every interactive control.
- Empty/error/loading states use semantic live regions only for asynchronous
  status changes.
- Responsive checks cover 375px, 768px, 1280px, and 1920px widths.
- Reduced-motion users do not receive new mandatory animation.
- Color is never the only indicator of status; badges/icons/text remain present.

## 9. Verification plan

For each wave:

1. Run the touched page/component tests.
2. Run the full frontend test suite.
3. Run frontend type-check and production build.
4. Run `pnpm verify` and report unrelated baseline failures separately.
5. Review the changed routes visually at the four target widths, including
   empty, loading, error, and populated states where fixtures already exist.

Completion means the acceptance criteria are met for all three waves, not just
that the shared primitives compile.
