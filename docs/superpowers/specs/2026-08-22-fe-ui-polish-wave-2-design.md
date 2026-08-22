# FE UI Polish Wave 2

## Status

Approved for implementation. This wave polishes existing operations, history,
and settings screens without changing product behavior or backend contracts.

## Goal

Make lower-traffic operational screens feel like one deliberate finance
workspace: clear state hierarchy, useful color, balanced density, and enough
visual context for empty or waiting screens without inventing data.

## Scope

- Bank connections: connection status, grouped actions, table rhythm, and
  empty/loading/error surfaces.
- Exceptions: review-queue emphasis, search/action grouping, selection state,
  and empty/error surfaces.
- Reminders: separate policy and execution sections, status treatment, filters,
  and empty states.
- Receivable balance history: page canvas, KPI/chart/table grouping, filters,
  pagination, and empty/error/loading states.
- Settings: settings heading/tabs, section icon hierarchy, member invitation,
  email templates, SMTP, appearance, and billing cards.

## Visual direction

Reuse the Wave 1 contract from `2026-08-22-fe-ui-polish-design.md`:

- Use the existing authenticated app canvas, centered content frame, `PageHeading`,
  `PageHeader`, `HeaderIcon`, `SectionCard`, `Card`, `Table`, and `EmptyState`.
- Use semantic tones: green for healthy/active, blue for connected/informative,
  amber for attention/pending, coral for failed/destructive, and violet only for
  AI surfaces.
- Keep icons decorative when text already communicates the state; icon-only
  controls retain accessible labels.
- Keep tables compact but readable: tinted headers, constrained long text,
  `tabular-nums` for money/counts, and actions that wrap without collision.
- Keep descriptions short, Vietnamese, and visually subordinate to titles.

## Area requirements

### Bank connections and exceptions

- Connection statuses must remain understandable from badge text and use color
  as a secondary signal.
- Keep grouped authorization actions together and visually distinct from row
  actions; do not change permission checks or mutation calls.
- Put exception search, selection feedback, bulk actions, and pagination into a
  clear rhythm so the review table does not look like an unstructured strip.
- Empty states should distinguish “no records” from “no search results” and
  preserve existing actions.

### Reminders and settings

- Treat reminder policies and execution history as two related but distinct
  workflows with their own icon/tone and spacing.
- Make active/failed execution and policy status easy to scan without relying on
  color alone.
- Settings tabs and cards should establish a clear hierarchy before forms or
  tables; tab labels and locked states remain accessible on narrow screens.
- Member, template, SMTP, appearance, and billing surfaces may use domain
  colors and icons, but must keep existing permissions, plan gates, and dialogs.

### Receivable balance history

- Remove accidental nested padding and make the page read as heading → summary
  → trends → filters → history table.
- Give KPI cards distinct semantic tones without turning the page into a rainbow
  dashboard.
- Keep chart loading/error states and CSV export behavior unchanged.
- Keep URL-backed filters and pagination unchanged.

## Non-goals and constraints

- No backend, API, domain, database, routing, or dependency changes.
- No invented records, metrics, or decorative filler content.
- No new shared abstraction unless an existing Wave 1 primitive cannot express
  the requirement; prefer feature-local classes and composition.
- Preserve URLs, query parameters, permissions, API calls, mutation behavior,
  keyboard focus, reduced-motion behavior, and dark-mode readability.
- User-visible copy remains Vietnamese except existing product terms.

## Acceptance criteria

- Each scoped page has a deliberate heading/section hierarchy and no accidental
  full-width empty strip on desktop.
- Populated, empty, loading, and error states remain distinguishable and
  accessible.
- Tables and action groups wrap at 375px/768px without clipped text or controls;
  desktop layouts remain balanced at 1280px/1920px.
- Status colors are semantic and always paired with text, badges, or icons.
- Existing feature tests pass, and no route/API/permission behavior changes.

## Verification

- Run touched feature tests after each task.
- Run the full frontend test suite, frontend type-check, production build, and
  scoped Biome checks after all tasks.
- Run `pnpm verify`; report the known unrelated landing-page formatting baseline
  failure separately if it remains.
