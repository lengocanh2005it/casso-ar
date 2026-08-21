# Detail Pages Icon/Card Polish Design

> Fixes [issue #308](https://github.com/lengocanh2005it/casso-ledger/issues/308). Follow-up to #307/PR #311 — extends the same icon/Card pattern to the pages explicitly deferred there: Customer Detail, Receivable Detail, Receivable Balance History, Bank Connections, Copilot.

## 1. Problem

PR #311 (#307) brought icon + `<Card>` polish to the 6 post-login list pages, and built two reusable pieces for it: `HeaderIcon` (`apps/frontend/src/components/layout/header-icon.tsx`) and `SectionCard` (`apps/frontend/src/components/layout/section-card.tsx`). Five pages were deliberately out of scope there because each has a different header/layout shape and needed individual judgment — this spec covers that judgment.

## 2. Decisions (from grilling)

No new shared components — this reuses `HeaderIcon`, `SectionCard`, and `PageHeading`'s existing `icon` prop exactly as built in #307/PR #311.

**Icon mapping** (reusing an existing module's icon where the page is clearly the same domain, matching the convention #307 already set — e.g. Exceptions reused Dashboard's `FileSearch`):

| Page | Icon | Why |
|------|------|-----|
| Customer Detail | `Users` | Same module as the Customers list page (#307) |
| Receivable Detail | `Receipt` | Same module as the Receivables list page (#307) |
| Receivable Balance History | `History` | Same concept as Reminders' "Lịch sử thực thi" section (#307) |
| Bank Connections | `Landmark` | New module, no prior icon — a bank/institution glyph fits "Kết nối ngân hàng" |
| Copilot | `Bot` | New module; `Sparkles` is already used on this same page for the "Nâng cấp gói" CTA, so a different icon avoids double meaning |

**Per-card icons inside detail pages: skipped.** Customer Detail already has 5 `<Card>`s and Receivable Detail already has 3 KPI `<Card>` tiles — unlike the 6 pages in #307 (one table = one page-level icon says it all), these pages are already dense with cards. Adding an icon to every inner `CardHeader` would add visual noise without a comprehension gain; the single page-level icon is enough context. This applies uniformly: Customer Detail's 5 cards, Receivable Detail's 3 KPI tiles, and Receivable Balance History's 3 KPI tiles (`ReceivableBalanceHistoryKpis`) all stay icon-free inside.

**Receivable Detail's 3 tabs (`ReceivablePayments`, `ReceivableTimeline`, `ReceivableTasks`) are NOT wrapped in `SectionCard`.** Each already renders inside a `TabsContent` panel, which is its own visual boundary. Nesting a `Card` border inside a tab panel produces a double border with no comprehension gain — unlike the 6 pages in #307, where `Card` was the *only* boundary on the page. These three components stay untouched.

**Receivable Balance History's table and Bank Connections' table DO get wrapped** in a header-less `SectionCard` (icon/title/description/action all omitted, matching how Customers/Receivables/Exceptions got a header-less Card in #307) — these are page-level tables with no competing visual boundary, same shape as the original 6 pages.

**Header migration, page by page:**

- **Customer Detail** (`apps/frontend/src/features/customers/pages/customer-detail-page.tsx`): the current header is a `<Link>` back button, then a `<p>` eyebrow + `<h1>{customer.name}</h1>` — structurally identical to what `PageHeading` already renders. Migrate it to `<PageHeading eyebrow="HỒ SƠ KHÁCH HÀNG" title={customer.name} icon={Users} />`, keeping the back-link above it unchanged.
- **Receivable Detail** (`apps/frontend/src/features/receivables/pages/receivable-detail-page.tsx`): the header row mixes a back-link, `<h1>`, a status badge, a disputed badge, an overdue badge, and (conditionally) three action buttons, all in one flex row. `PageHeading`'s `title` prop is `string`, so badges can't go there, and its `actions` slot sits far to the right — forcing this into `PageHeading` would require restructuring the badge/action layout, which is out of scope. Instead, wrap just the `<h1>` in a `<HeaderIcon icon={Receipt} />` + `<h1>` pair (same visual language as `PageHeading`'s left-icon treatment), leaving the back-link, badges, and action buttons exactly where they are.
- **Receivable Balance History** (`apps/frontend/src/features/receivable-balance-history/pages/receivable-balance-history-page.tsx`): already uses `PageHeading` in all three render branches (loading/error/success) — add `icon={History}` to all three call sites so the icon doesn't flicker in/out as the page loads.
- **Bank Connections** (`apps/frontend/src/features/bank-connections/pages/bank-connections-page.tsx`): already uses `PageHeading` — add `icon={Landmark}`.
- **Copilot** (`apps/frontend/src/features/copilot/pages/copilot-page.tsx`): the header is a plain `<h1 className="text-xl font-semibold sm:text-2xl">Copilot</h1>` next to `<UsageIndicator />`, inside a flex row — not a `PageHeading` candidate (no eyebrow, tight custom layout, lives inside the chat shell rather than a standalone page header). Add `<HeaderIcon icon={Bot} />` immediately before the `<h1>`, inside the same flex row. No other change to the Copilot page — the chat UI itself (message list, input, sidebars, paywall gate) is untouched.

## 3. Out of scope

- Any change to `ReceivablePayments`, `ReceivableTimeline`, `ReceivableTasks` (§2, tabs already bounded by `TabsContent`).
- Per-card icons inside Customer Detail's 5 cards or either page's KPI tiles (§2).
- Any change to Copilot's chat behavior, dialogs, sidebars, or paywall gate — header icon only.
- New shared components — everything here reuses `HeaderIcon`/`SectionCard`/`PageHeading` unchanged from #307/PR #311.
- Per-row entity icons — already tracked separately in #309.

## 4. Test depth

Presentational-only change reusing already-tested shared components (`HeaderIcon`/`SectionCard`/`PageHeading` all shipped with their own specs in PR #311). No new spec files — each touched page's existing `*.spec.tsx` is re-run as the regression check.
