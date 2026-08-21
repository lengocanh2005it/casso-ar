# Post-Login Page Icon/Card Polish Design

> Fixes [issue #307](https://github.com/lengocanh2005it/casso-ledger/issues/307). Touches `apps/frontend/src/components/layout/page-heading.tsx`, `apps/frontend/src/components/layout/page-header.tsx`, and 6 feature pages: Customers, Receivables, Reminders, Reports, Settings, Exceptions.
>
> Follow-ups deliberately out of scope: [#308](https://github.com/lengocanh2005it/casso-ledger/issues/308) (detail pages, Bank Connections, Copilot) and [#309](https://github.com/lengocanh2005it/casso-ledger/issues/309) (per-row entity icons).

## 1. Problem

Dashboard (`apps/frontend/src/features/dashboard/pages/dashboard-page.tsx`) already uses lucide-react icons, `<Card>` with `border-l` accent colors, and the `fade-up` animation token. The 6 pages in scope only render `PageHeading` (plain text, no icon) followed by a bare `<Table>` — no `<Card>`, no icons — which reads as flat/monochrome next to the Dashboard.

## 2. Decisions (from grilling)

- **Scope:** exactly 6 pages — Customers, Receivables, Reminders, Reports, Settings, Exceptions. No detail pages, no Bank Connections, no Copilot (→ #308).
- **Accent color:** single `primary` (green) for every module. The Dashboard's per-variant colors (success/warning/danger) are a *semantic state* system (e.g. "overdue" = red) — this change does not introduce a second, module-based color system that could visually collide with it.
- **Icon mapping** (lucide-react, avoiding icons already tied to a different meaning on the Dashboard):
  | Page | Icon |
  |------|------|
  | Customers | `Users` |
  | Receivables | `Receipt` |
  | Reminders | `Bell` |
  | Reports | `BarChart3` |
  | Settings | `Settings` |
  | Exceptions | `FileSearch` (same icon Dashboard already uses for "Cần đối soát" — same concept) |
- **Row-level icons** (avatar-chip per table row): explicitly deferred to #309.
- **Animation:** reuse the existing `fade-up` token (`index.css`) on newly-added `<Card>`s — free, already used by Dashboard.
- **Settings header:** `PageHeader` (`apps/frontend/src/components/layout/page-header.tsx`) is a separate component from `PageHeading`, used only by `SettingsPage`. Add a matching `icon` prop to `PageHeader` itself rather than migrating Settings to `PageHeading` — migrating would also change the sticky-header/`ThemeToggle` behavior unique to Settings, which is out of scope.
- **Settings tab bodies:** of the 5 tabs, `BillingTab`/`SmtpTab` already use `<Card>`. Of the remaining 3, only `UsersTab` and `EmailTemplatesTab` have a bare `<Table>` and get the same Card treatment. `AppearanceTab` has no table (a 3-button theme grid, already has icons) and is left untouched.
- **Test depth:** this is a presentational-only change. Only `PageHeading` and `PageHeader` get a new assertion (icon renders when the prop is passed) — the per-page Card-wrap edits are covered by re-running each page's existing spec, not new specs.

## 3. `PageHeading` icon prop

`apps/frontend/src/components/layout/page-heading.tsx` currently:

```tsx
interface PageHeadingProps {
  eyebrow: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}
```

Add an optional `icon?: LucideIcon`, rendered to the left of the eyebrow/title stack, sized `size-8` in a `bg-primary/10 text-primary` rounded box (matches the existing `bg-primary/10` convention already used for the sidebar active state and `UserAvatar`). When `icon` is omitted, render nothing extra — output is byte-identical to today for any caller that doesn't pass it.

## 4. `PageHeader` icon prop

`apps/frontend/src/components/layout/page-header.tsx` gets the identical optional `icon?: LucideIcon`, rendered the same way, to the left of the `title`/`description` block. Only `SettingsPage` passes it.

## 5. Per-page changes

For each of the 6 pages, two independent changes land together:

1. Pass the page's `icon` (§2 table) into `PageHeading`/`PageHeader`.
2. Wrap the page's loading/error/empty/table region in `<Card>` (`apps/frontend/src/components/ui/card.tsx`, already used by Dashboard/Reports/detail pages) with the `animate-fade-up motion-reduce:animate-none` class, so a slow network still animates the card in once data resolves. Search inputs, filter controls, and pagination footers stay **outside** the Card, unchanged — only the data region (skeleton/error message/empty state/table) moves inside `<CardContent>`.

Pages that already have a plain-text `<h2>` section title above their table (Reminders' two sections, `UsersTab`'s "Thành viên", `EmailTemplatesTab`'s "Mẫu email") get a `<CardHeader>` with an icon + `<CardTitle>` replacing that `<h2>`, matching the Reports page's existing `<Card><CardHeader><CardTitle>` pattern. Pages with no section `<h2>` (Customers, Receivables, Exceptions — their only heading is the page-level `PageHeading` above) get a `<Card><CardContent>` with no `CardHeader`, avoiding a redundant duplicate title.

Reports already wraps every section in `<Card>` — it only gets the `PageHeading` icon (§2), no structural change.

## 6. Out of scope (confirmed via grilling, tracked separately)

- Detail pages (`customer-detail-page.tsx`, `receivable-detail-page.tsx`, `receivable-balance-history-page.tsx`), Bank Connections, Copilot — #308.
- Per-row entity icons in table bodies — #309.
- `AppearanceTab` — no table, already has icons, not touched.
