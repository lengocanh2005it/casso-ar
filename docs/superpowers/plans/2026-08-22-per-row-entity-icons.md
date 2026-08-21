# Per-Row Entity Icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a small chip (avatar-with-initials or icon) next to the primary identifying column of the 6 tables polished in #307/#308, reusing components already built there.

**Architecture:** Rename `UserAvatar` → `InitialsAvatar` (mechanical, no behavior change) so it reads correctly when reused for non-user entities. Reuse `HeaderIcon` unchanged for the two tables whose primary column isn't a person/org name. No new components.

**Tech Stack:** React 19, lucide-react, Vitest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-22-per-row-entity-icons-design.md`

## Global Constraints

- No new shared components — only `InitialsAvatar` (renamed from `UserAvatar`) and the existing `HeaderIcon` are used (spec §2).
- Every chip is `size="sm"` (`size-9`) / `bg-primary/10 text-primary` — no per-entity color variation (spec §2).
- Exceptions table: render `InitialsAvatar` only when `counterpartyName` is non-empty; otherwise render just `—` as today (spec §2).
- No new spec files — re-run each touched table's existing spec (or its page-level spec where no dedicated table spec exists) as the regression check (spec §2).
- `PendingInvitesTable` and `ExecutionsTable` are NOT touched (spec §5).
- Biome: single quotes, semicolons, 2-space indent, no trailing commas (`CLAUDE.local.md`).

---

### Task 1: Rename `UserAvatar` → `InitialsAvatar`

**Files:**
- Rename: `apps/frontend/src/components/shared/user-avatar.tsx` → `apps/frontend/src/components/shared/initials-avatar.tsx`
- Modify: `apps/frontend/src/components/layout/sidebar-footer.tsx`
- Modify: `apps/frontend/src/components/layout/profile-dialog.tsx`

**Interfaces:**
- Produces (for Tasks 2–7 to consume): `InitialsAvatar({ name, avatarUrl?, size?, className? })` from `@/components/shared/initials-avatar` — identical props/behavior to the old `UserAvatar`.

- [ ] **Step 1: Rename the file and the exported function**

Move `apps/frontend/src/components/shared/user-avatar.tsx` to `apps/frontend/src/components/shared/initials-avatar.tsx`. Inside the moved file, rename every occurrence of `UserAvatar` to `InitialsAvatar` (the interface `UserAvatarProps` → `InitialsAvatarProps`, and the exported function name). No other line changes — the JSX body, `getInitials`, and `SIZE_CLASSES` are untouched.

- [ ] **Step 2: Update `sidebar-footer.tsx`**

Change:

```tsx
import { UserAvatar } from '@/components/shared/user-avatar';
```

to:

```tsx
import { InitialsAvatar } from '@/components/shared/initials-avatar';
```

Change both occurrences of `<UserAvatar name={user.name} avatarUrl={user.avatarUrl} size="sm" />` to `<InitialsAvatar name={user.name} avatarUrl={user.avatarUrl} size="sm" />`.

- [ ] **Step 3: Update `profile-dialog.tsx`**

Change:

```tsx
import { UserAvatar } from '@/components/shared/user-avatar';
```

to:

```tsx
import { InitialsAvatar } from '@/components/shared/initials-avatar';
```

Change:

```tsx
                    <UserAvatar
                      name={user.name}
                      avatarUrl={pendingAvatarPreview ?? user.avatarUrl}
                      size="lg"
                    />
```

to:

```tsx
                    <InitialsAvatar
                      name={user.name}
                      avatarUrl={pendingAvatarPreview ?? user.avatarUrl}
                      size="lg"
                    />
```

- [ ] **Step 4: Run the existing regression tests**

Run: `npx vitest run apps/frontend/src/components/layout/sidebar-footer.spec.tsx apps/frontend/src/components/layout/profile-dialog.spec.tsx`
Expected: PASS (both specs render the sidebar footer / profile dialog and assert on visible text/initials, not on the component's internal name — unaffected by the rename)

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors (confirms no stale `@/components/shared/user-avatar` import remains anywhere)

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/components/shared/initials-avatar.tsx apps/frontend/src/components/layout/sidebar-footer.tsx apps/frontend/src/components/layout/profile-dialog.tsx
git rm apps/frontend/src/components/shared/user-avatar.tsx
git commit -m "refactor: rename UserAvatar to InitialsAvatar for entity-name reuse"
```

(if the rename was done via `mv` and git already tracks it as a rename, `git add -A apps/frontend/src/components/shared apps/frontend/src/components/layout/sidebar-footer.tsx apps/frontend/src/components/layout/profile-dialog.tsx` is sufficient — the explicit `git rm` above is only needed if the old file still shows as untouched)

---

### Task 2: `CustomerTable` — avatar chip

**Files:**
- Modify: `apps/frontend/src/features/customers/components/customer-table.tsx`

**Interfaces:**
- Consumes: `InitialsAvatar` (Task 1).

- [ ] **Step 1: Add the import**

Change:

```tsx
import { Link } from 'react-router-dom';
import {
```

to:

```tsx
import { Link } from 'react-router-dom';
import { InitialsAvatar } from '@/components/shared/initials-avatar';
import {
```

- [ ] **Step 2: Add the chip**

Change:

```tsx
            <TableCell className="max-w-64 break-words">
              <Link
                to={`/customers/${customer.id}`}
                className="font-medium text-primary pointer-hover:hover:underline"
              >
                {customer.name}
              </Link>
            </TableCell>
```

to:

```tsx
            <TableCell className="max-w-64 break-words">
              <div className="flex items-center gap-2">
                <InitialsAvatar name={customer.name} size="sm" />
                <Link
                  to={`/customers/${customer.id}`}
                  className="font-medium text-primary pointer-hover:hover:underline"
                >
                  {customer.name}
                </Link>
              </div>
            </TableCell>
```

- [ ] **Step 3: Run the existing regression test**

Run: `npx vitest run apps/frontend/src/features/customers/pages/customers-page.spec.tsx`
Expected: PASS (no dedicated `customer-table.spec.tsx` exists — `CustomerTable` is covered through the Customers page spec)

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/customers/components/customer-table.tsx
git commit -m "feat: add avatar chip to Customers table rows"
```

---

### Task 3: `CustomerAgingTable` — avatar chip

**Files:**
- Modify: `apps/frontend/src/features/reports/components/customer-aging-table.tsx`

**Interfaces:**
- Consumes: `InitialsAvatar` (Task 1).

- [ ] **Step 1: Add the import**

Change:

```tsx
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatVND } from '@/lib/format';
```

to:

```tsx
import { InitialsAvatar } from '@/components/shared/initials-avatar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatVND } from '@/lib/format';
```

- [ ] **Step 2: Add the chip**

Change:

```tsx
            <TableCell className="max-w-64 break-words">
              {row.customerName}
            </TableCell>
```

to:

```tsx
            <TableCell className="max-w-64 break-words">
              <div className="flex items-center gap-2">
                <InitialsAvatar name={row.customerName} size="sm" />
                {row.customerName}
              </div>
            </TableCell>
```

- [ ] **Step 3: Run the existing regression test**

Run: `npx vitest run apps/frontend/src/features/reports/pages/reports-page.spec.tsx`
Expected: PASS (no dedicated `customer-aging-table.spec.tsx` exists — covered through the Reports page spec)

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/reports/components/customer-aging-table.tsx
git commit -m "feat: add avatar chip to Reports customer aging table rows"
```

---

### Task 4: `PolicyTable` — avatar chip

**Files:**
- Modify: `apps/frontend/src/features/reminders/components/policy-table.tsx`

**Interfaces:**
- Consumes: `InitialsAvatar` (Task 1).

- [ ] **Step 1: Add the import**

Change:

```tsx
import { Permission } from '@casso-ledger/shared-types';
import { Button } from '@/components/ui/button';
```

to:

```tsx
import { Permission } from '@casso-ledger/shared-types';
import { InitialsAvatar } from '@/components/shared/initials-avatar';
import { Button } from '@/components/ui/button';
```

- [ ] **Step 2: Add the chip**

Change:

```tsx
            <TableCell className="font-medium">
              {policy.customerGroup}
            </TableCell>
```

to:

```tsx
            <TableCell className="font-medium">
              <div className="flex items-center gap-2">
                <InitialsAvatar name={policy.customerGroup} size="sm" />
                {policy.customerGroup}
              </div>
            </TableCell>
```

- [ ] **Step 3: Run the existing regression test**

Run: `npx vitest run apps/frontend/src/features/reminders/components/policy-table.spec.tsx`
Expected: PASS

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/reminders/components/policy-table.tsx
git commit -m "feat: add avatar chip to Reminders policy table rows"
```

---

### Task 5: Exceptions table — avatar chip with empty-name fallback

**Files:**
- Modify: `apps/frontend/src/features/exceptions/pages/exceptions-page.tsx`

**Interfaces:**
- Consumes: `InitialsAvatar` (Task 1).

- [ ] **Step 1: Add the import**

Change:

```tsx
import { FileSearch } from 'lucide-react';
import { useState } from 'react';
import { PageHeading } from '@/components/layout/page-heading';
import { SectionCard } from '@/components/layout/section-card';
import { Badge } from '@/components/ui/badge';
```

to:

```tsx
import { FileSearch } from 'lucide-react';
import { useState } from 'react';
import { PageHeading } from '@/components/layout/page-heading';
import { SectionCard } from '@/components/layout/section-card';
import { InitialsAvatar } from '@/components/shared/initials-avatar';
import { Badge } from '@/components/ui/badge';
```

- [ ] **Step 2: Add the chip with the empty-name fallback**

Change:

```tsx
                  <TableCell className="max-w-64 break-words">
                    {row.transaction.counterpartyName || '—'}
                  </TableCell>
```

to:

```tsx
                  <TableCell className="max-w-64 break-words">
                    {row.transaction.counterpartyName ? (
                      <div className="flex items-center gap-2">
                        <InitialsAvatar
                          name={row.transaction.counterpartyName}
                          size="sm"
                        />
                        {row.transaction.counterpartyName}
                      </div>
                    ) : (
                      '—'
                    )}
                  </TableCell>
```

- [ ] **Step 3: Run the existing regression test**

Run: `npx vitest run apps/frontend/src/features/exceptions/pages/exceptions-page.spec.tsx`
Expected: PASS

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/exceptions/pages/exceptions-page.tsx
git commit -m "feat: add avatar chip to Exceptions table rows"
```

---

### Task 6: `MembersTable` (Settings → Users tab) — avatar chip

**Files:**
- Modify: `apps/frontend/src/features/settings/components/users-tab.tsx`

**Interfaces:**
- Consumes: `InitialsAvatar` (Task 1).

- [ ] **Step 1: Add the import**

Change:

```tsx
import { Users } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import { SectionCard } from '@/components/layout/section-card';
import {
  AlertDialog,
```

to:

```tsx
import { Users } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import { SectionCard } from '@/components/layout/section-card';
import { InitialsAvatar } from '@/components/shared/initials-avatar';
import {
  AlertDialog,
```

- [ ] **Step 2: Add the chip**

Change:

```tsx
              <TableCell className="break-words">{member.name}</TableCell>
```

to:

```tsx
              <TableCell className="break-words">
                <div className="flex items-center gap-2">
                  <InitialsAvatar name={member.name} size="sm" />
                  {member.name}
                </div>
              </TableCell>
```

- [ ] **Step 3: Run the existing regression test**

Run: `npx vitest run apps/frontend/src/features/settings/components/users-tab.spec.tsx`
Expected: PASS

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/settings/components/users-tab.tsx
git commit -m "feat: add avatar chip to Settings members table rows"
```

---

### Task 7: `ReceivableTable` and `EmailTemplatesTab` — icon chip

**Files:**
- Modify: `apps/frontend/src/features/receivables/components/receivable-table.tsx`
- Modify: `apps/frontend/src/features/settings/components/email-templates-tab.tsx`

**Interfaces:**
- Consumes: `HeaderIcon` (already built in PR #311, unchanged).

- [ ] **Step 1: Add imports to `receivable-table.tsx`**

Change:

```tsx
import { ReceivableStatus } from '@casso-ledger/shared-types';
import { Link } from 'react-router-dom';
import { ReceivableStatusBadge } from '@/components/receivable-status-badge';
```

to:

```tsx
import { ReceivableStatus } from '@casso-ledger/shared-types';
import { Receipt } from 'lucide-react';
import { Link } from 'react-router-dom';
import { HeaderIcon } from '@/components/layout/header-icon';
import { ReceivableStatusBadge } from '@/components/receivable-status-badge';
```

- [ ] **Step 2: Add the chip in `receivable-table.tsx`**

Change:

```tsx
            <TableCell>
              <Link
                to={`/receivables/${receivable.id}`}
                className={
                  receivable.invoiceNumber
                    ? 'font-medium text-primary pointer-hover:hover:underline'
                    : 'font-medium text-muted-foreground italic pointer-hover:hover:underline'
                }
              >
                {receivable.invoiceNumber ?? 'Không có hóa đơn'}
              </Link>
            </TableCell>
```

to:

```tsx
            <TableCell>
              <div className="flex items-center gap-2">
                <HeaderIcon icon={Receipt} />
                <Link
                  to={`/receivables/${receivable.id}`}
                  className={
                    receivable.invoiceNumber
                      ? 'font-medium text-primary pointer-hover:hover:underline'
                      : 'font-medium text-muted-foreground italic pointer-hover:hover:underline'
                  }
                >
                  {receivable.invoiceNumber ?? 'Không có hóa đơn'}
                </Link>
              </div>
            </TableCell>
```

- [ ] **Step 3: Run the existing regression test**

Run: `npx vitest run apps/frontend/src/features/receivables/components/receivable-table.spec.tsx`
Expected: PASS

- [ ] **Step 4: Add imports to `email-templates-tab.tsx`**

Change:

```tsx
import { Permission } from '@casso-ledger/shared-types';
import { Mail } from 'lucide-react';
import { useState } from 'react';
import { SectionCard } from '@/components/layout/section-card';
import {
  AlertDialog,
```

to:

```tsx
import { Permission } from '@casso-ledger/shared-types';
import { Mail } from 'lucide-react';
import { useState } from 'react';
import { HeaderIcon } from '@/components/layout/header-icon';
import { SectionCard } from '@/components/layout/section-card';
import {
  AlertDialog,
```

- [ ] **Step 5: Add the chip in `email-templates-tab.tsx`**

Change:

```tsx
                <TableCell className="max-w-56 break-words font-medium">
                  {template.name}
                </TableCell>
```

to:

```tsx
                <TableCell className="max-w-56 break-words font-medium">
                  <div className="flex items-center gap-2">
                    <HeaderIcon icon={Mail} />
                    {template.name}
                  </div>
                </TableCell>
```

- [ ] **Step 6: Run the existing regression test**

Run: `npx vitest run apps/frontend/src/features/settings/components/email-templates-tab.spec.tsx`
Expected: PASS

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/features/receivables/components/receivable-table.tsx apps/frontend/src/features/settings/components/email-templates-tab.tsx
git commit -m "feat: add icon chip to Receivables and Email Templates table rows"
```

---

### Task 8: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full frontend test suite**

Run: `pnpm --filter @casso-ledger/frontend test`
Expected: PASS, no regressions outside the files touched above

- [ ] **Step 2: Full type-check and lint**

Run: `npx tsc --noEmit` then `npx biome check .`
Expected: no errors (run `npx biome check --write .` and re-review the diff if formatting-only issues appear)

- [ ] **Step 3: Manually verify in the running app**

Start `pnpm dev:backend` and the frontend dev server. Visit: Customers (avatar next to each name), Reports → aging table (avatar next to customer name), Reminders (avatar next to customer group), Exceptions (avatar next to counterparty name, plain `—` for rows with no counterparty), Settings → Users tab (avatar next to member name), Receivables (receipt icon next to invoice number), Settings → Email Templates tab (mail icon next to template name). Confirm dark mode still reads correctly and no row height/alignment shifted.

- [ ] **Step 4: Update the feature map**

Check `docs/wayfinder/feature-map.md` for an entry referencing issue #309. If one exists, update its status to `done` with the shipped date and PR reference once the PR is opened. If none exists, skip this step.

- [ ] **Step 5: Open the PR**

```bash
git push -u origin lengocanh2005it/issue-309-per-row-entity-icons
gh pr create --title "feat: add per-row entity icons to main list tables" --body "Closes #309"
```
