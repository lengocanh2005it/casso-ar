# Per-Row Entity Icons Design

> Fixes [issue #309](https://github.com/lengocanh2005it/casso-ledger/issues/309). Follow-up to #307/#308 — adds a small chip next to the primary identifying column of each of the 6 tables polished in #307, reusing components already built there. No new shared components.

## 1. Problem

#307/#308 added a page-level icon and `<Card>` wrap to 6 list pages, but every table's rows are still plain text. Issue #309 asks for a small icon/avatar chip next to each row's main identifying value, deferred from #307 to avoid scope creep and to see first whether the page-level treatment alone was "alive" enough.

## 2. Decisions (from grilling)

- **No new component.** Two components already exist and already match the exact visual language needed:
  - `UserAvatar` (`apps/frontend/src/components/shared/user-avatar.tsx`) — `size="sm"` is `size-9`, circular, initials from a `name` string, `bg-primary/10 text-primary`. Nothing about it is user-specific beyond the name; it is **renamed to `InitialsAvatar`** (file renamed to `initials-avatar.tsx`) so reusing it for customers/receivables/policies doesn't read as a type error in intent. The two existing callers (`sidebar-footer.tsx`, `profile-dialog.tsx`, both showing an actual logged-in user) are updated to the new name — behavior and props (`name`, `avatarUrl`, `size`, `className`) are unchanged.
  - `HeaderIcon` (`apps/frontend/src/components/layout/header-icon.tsx`) — the `size-9` `bg-primary/10 text-primary` icon box already used by `PageHeading`/`PageHeader`. Reused as-is for rows whose main column is **not** a person/organization name.
- **Per-table chip type** — the primary column decides which chip fits:

  | Table | Page | Primary column | Chip |
  |---|---|---|---|
  | `CustomerTable` | Customers | Customer name | `InitialsAvatar` |
  | `CustomerAgingTable` | Reports | Customer name | `InitialsAvatar` |
  | `PolicyTable` | Reminders | `customerGroup` | `InitialsAvatar` |
  | Exceptions inline table | Exceptions | Counterparty name | `InitialsAvatar` (only when the name is non-empty — see below) |
  | `MembersTable` | Settings → Users tab | Member name | `InitialsAvatar` |
  | `ReceivableTable` | Receivables | Invoice number | `HeaderIcon icon={Receipt}` |
  | `EmailTemplatesTab`'s table | Settings → Email Templates tab | Template name | `HeaderIcon icon={Mail}` |

  `Receipt` and `Mail` are the same icons already assigned to these pages/tabs in #307/#308 — no new icon choices.

- **Empty-name fallback (Exceptions only).** `row.transaction.counterpartyName` can be empty, currently rendered as `—`. When empty, no `InitialsAvatar` renders — only the `—` text, to avoid a blank/empty-initials circle that looks broken rather than informative.
- **Uniform sizing/color.** Every chip is `size-9`, `bg-primary/10 text-primary` — no per-entity color variation, consistent with #307/#308's "single primary accent" rule.
- **Placement.** The chip sits to the immediate left of the existing text/link in the same table cell, wrapped in `<div className="flex items-center gap-2">`. No other column, no row height, no table structure changes.
- **Test depth.** No new component, so no new spec files. `InitialsAvatar`'s rename is a mechanical rename with no behavior change — existing usages in `sidebar-footer.tsx`/`profile-dialog.tsx` are covered by their own existing specs. The 6 touched tables' existing specs are re-run as the regression check.

## 3. Rename: `UserAvatar` → `InitialsAvatar`

**Files:**
- Rename `apps/frontend/src/components/shared/user-avatar.tsx` → `apps/frontend/src/components/shared/initials-avatar.tsx`, rename the exported function `UserAvatar` → `InitialsAvatar`. Props/behavior unchanged.
- Update the two callers' imports and JSX tag: `apps/frontend/src/components/layout/sidebar-footer.tsx`, `apps/frontend/src/components/layout/profile-dialog.tsx`.

## 4. Per-table changes

Each of the 6 tables gets exactly one change: import the chip component, wrap the primary column's existing content with `<div className="flex items-center gap-2">` + the chip.

- `CustomerTable`: `<InitialsAvatar name={customer.name} size="sm" />` before the existing `<Link>`.
- `CustomerAgingTable`: `<InitialsAvatar name={row.customerName} size="sm" />` before the existing plain text.
- `PolicyTable`: `<InitialsAvatar name={policy.customerGroup} size="sm" />` before the existing plain text.
- Exceptions inline table: `{row.transaction.counterpartyName ? (<div className="flex items-center gap-2"><InitialsAvatar name={row.transaction.counterpartyName} size="sm" />{row.transaction.counterpartyName}</div>) : '—'}` replacing the current `{row.transaction.counterpartyName || '—'}`.
- `MembersTable` (in `users-tab.tsx`): `<InitialsAvatar name={member.name} size="sm" />` before `{member.name}`.
- `ReceivableTable`: `<HeaderIcon icon={Receipt} />` before the existing invoice-number `<Link>`.
- `EmailTemplatesTab`'s table: `<HeaderIcon icon={Mail} />` before the existing template-name text.

## 5. Out of scope

- `PendingInvitesTable` (Settings) — lists invite emails, not a resolved person/org name; not one of the 6 original #307 tables.
- `ExecutionsTable` (Reminders' second section) — not the table named in the issue ("Reminder policy name in reminders policy table" = `PolicyTable`).
- Any icon size, color, or animation change beyond reusing the two existing components unchanged.
- Any new avatar image support (`avatarUrl`) for non-user entities — customers/receivables/policies/templates have no avatar image field; `InitialsAvatar` always falls through to its initials branch for these callers, which is already how the component behaves when `avatarUrl` is omitted.
