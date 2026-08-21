# Detail Pages Icon/Card Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the icon/`Card` polish from #307/PR #311 to the 5 pages deferred there — Customer Detail, Receivable Detail, Receivable Balance History, Bank Connections, Copilot — reusing `HeaderIcon`/`SectionCard`/`PageHeading` unchanged.

**Architecture:** No new components. Each page gets exactly the header/Card treatment decided per-page in the spec — some get a full `PageHeading` icon, some get a standalone `HeaderIcon`, some get both an icon and a header-less `SectionCard` around their table.

**Tech Stack:** React 19, lucide-react, shadcn/ui `Card` (via `SectionCard`), Vitest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-21-detail-pages-icon-card-polish-design.md`

## Global Constraints

- No new shared components — reuse `HeaderIcon` (`apps/frontend/src/components/layout/header-icon.tsx`) and `SectionCard` (`apps/frontend/src/components/layout/section-card.tsx`) exactly as they ship from PR #311.
- Icon mapping is fixed: Customer Detail→`Users`, Receivable Detail→`Receipt`, Receivable Balance History→`History`, Bank Connections→`Landmark`, Copilot→`Bot` (spec §2).
- No per-card icons inside Customer Detail's 5 cards or either page's KPI tiles (spec §2).
- Receivable Detail's 3 tabs (`ReceivablePayments`, `ReceivableTimeline`, `ReceivableTasks`) are NOT touched — no `SectionCard` wrap (spec §2).
- Copilot's chat behavior, dialogs, sidebars, and paywall gate are untouched — header icon only (spec §2).
- Presentational-only — no new spec files; re-run each page's existing spec as the regression check (spec §4).
- Biome: single quotes, semicolons, 2-space indent, no trailing commas (`CLAUDE.local.md`).

---

### Task 1: Customer Detail — migrate header to `PageHeading`

**Files:**
- Modify: `apps/frontend/src/features/customers/pages/customer-detail-page.tsx`

**Interfaces:**
- Consumes: `PageHeading` with `icon` (already built in PR #311).

- [ ] **Step 1: Add imports**

Change:

```tsx
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
```

to:

```tsx
import { Users } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeading } from '@/components/layout/page-heading';
import { Button } from '@/components/ui/button';
```

- [ ] **Step 2: Replace the custom header**

Change:

```tsx
      <div>
        <p className="text-sm font-medium text-primary">HỒ SƠ KHÁCH HÀNG</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {customer.name}
        </h1>
      </div>
```

to:

```tsx
      <PageHeading
        eyebrow="HỒ SƠ KHÁCH HÀNG"
        title={customer.name}
        icon={Users}
      />
```

The `<Link to="/customers">← Quay lại khách hàng</Link>` line immediately above stays exactly as-is.

- [ ] **Step 3: Run the existing regression test**

Run: `npx vitest run apps/frontend/src/features/customers/pages/customer-detail-page.spec.tsx`
Expected: PASS

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/customers/pages/customer-detail-page.tsx
git commit -m "feat: migrate Customer Detail header to PageHeading with icon"
```

---

### Task 2: Receivable Detail — `HeaderIcon` next to the custom header

**Files:**
- Modify: `apps/frontend/src/features/receivables/pages/receivable-detail-page.tsx`

**Interfaces:**
- Consumes: `HeaderIcon` (already built in PR #311).

- [ ] **Step 1: Add imports**

Change:

```tsx
import { Link, useParams } from 'react-router-dom';
import { ReceivableStatusBadge } from '@/components/receivable-status-badge';
import { Badge } from '@/components/ui/badge';
```

to:

```tsx
import { Receipt } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { HeaderIcon } from '@/components/layout/header-icon';
import { ReceivableStatusBadge } from '@/components/receivable-status-badge';
import { Badge } from '@/components/ui/badge';
```

- [ ] **Step 2: Add the icon next to the title**

Change:

```tsx
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/receivables"
            className="text-sm text-primary pointer-hover:hover:underline"
          >
            ← Công nợ
          </Link>
          <h1 className="text-2xl font-semibold" title={receivable.id}>
            {receivable.invoiceNumber ?? `#${receivable.id.slice(0, 8)}`}
          </h1>
          <ReceivableStatusBadge status={receivable.status} />
```

to:

```tsx
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/receivables"
            className="text-sm text-primary pointer-hover:hover:underline"
          >
            ← Công nợ
          </Link>
          <HeaderIcon icon={Receipt} />
          <h1 className="text-2xl font-semibold" title={receivable.id}>
            {receivable.invoiceNumber ?? `#${receivable.id.slice(0, 8)}`}
          </h1>
          <ReceivableStatusBadge status={receivable.status} />
```

No other line in this file changes — badges, action buttons, KPI cards, and the 3 tabs stay exactly as they are.

- [ ] **Step 3: Run the existing regression test**

Run: `npx vitest run apps/frontend/src/features/receivables/pages/receivable-detail-page.spec.tsx`
Expected: PASS

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/receivables/pages/receivable-detail-page.tsx
git commit -m "feat: add header icon to Receivable Detail page"
```

---

### Task 3: Receivable Balance History — `PageHeading` icon + `SectionCard` around the table

**Files:**
- Modify: `apps/frontend/src/features/receivable-balance-history/pages/receivable-balance-history-page.tsx`

**Interfaces:**
- Consumes: `PageHeading` with `icon`, `SectionCard` (both already built in PR #311).

- [ ] **Step 1: Add imports**

Change:

```tsx
import { lazy, Suspense, useEffect, useMemo } from 'react';
import { PageHeading } from '@/components/layout/page-heading';
import { Button } from '@/components/ui/button';
```

to:

```tsx
import { History } from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo } from 'react';
import { PageHeading } from '@/components/layout/page-heading';
import { SectionCard } from '@/components/layout/section-card';
import { Button } from '@/components/ui/button';
```

- [ ] **Step 2: Add `icon={History}` to all three `PageHeading` call sites**

This page renders `PageHeading` in three branches (loading, error, success) with identical `eyebrow`/`title`/`description`. Add `icon={History}` to each of the three:

```tsx
        <PageHeading
          eyebrow="BÁO CÁO"
          title="Lịch sử công nợ"
          description="Lịch sử biến động số dư công nợ theo thời gian."
          icon={History}
          actions={<Button disabled>Xuất CSV</Button>}
        />
```

```tsx
        <PageHeading
          eyebrow="BÁO CÁO"
          title="Lịch sử công nợ"
          description="Lịch sử biến động số dư công nợ theo thời gian."
          icon={History}
        />
```

```tsx
      <PageHeading
        eyebrow="BÁO CÁO"
        title="Lịch sử công nợ"
        description="Lịch sử biến động số dư công nợ theo thời gian."
        icon={History}
        actions={
          <Button
            onClick={handleExport}
            disabled={isExporting}
            aria-busy={isExporting}
          >
            {isExporting && <Spinner className="size-4" />}
            <span aria-live="polite">
              {isExporting ? 'Đang xuất…' : 'Xuất CSV'}
            </span>
          </Button>
        }
      />
```

- [ ] **Step 3: Wrap the table region in a header-less `SectionCard`**

Change:

```tsx
      {items.length === 0 ? (
        <ReceivableBalanceHistoryEmpty />
      ) : (
        <ReceivableBalanceHistoryTable items={items} />
      )}
```

to:

```tsx
      <SectionCard>
        {items.length === 0 ? (
          <ReceivableBalanceHistoryEmpty />
        ) : (
          <ReceivableBalanceHistoryTable items={items} />
        )}
      </SectionCard>
```

The KPI cards (`ReceivableBalanceHistoryKpis`), charts, and filters above/below stay untouched.

- [ ] **Step 4: Run the existing regression test**

Run: `npx vitest run apps/frontend/src/features/receivable-balance-history/pages/receivable-balance-history-page.spec.tsx`
Expected: PASS

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/receivable-balance-history/pages/receivable-balance-history-page.tsx
git commit -m "feat: add icon and Card to Receivable Balance History page"
```

---

### Task 4: Bank Connections — `PageHeading` icon + `SectionCard` around the table

**Files:**
- Modify: `apps/frontend/src/features/bank-connections/pages/bank-connections-page.tsx`

**Interfaces:**
- Consumes: `PageHeading` with `icon`, `SectionCard` (both already built in PR #311).

- [ ] **Step 1: Replace the full file contents**

```tsx
import { Landmark } from 'lucide-react';
import { PageHeading } from '@/components/layout/page-heading';
import { SectionCard } from '@/components/layout/section-card';
import { usePollConnections } from '../api/use-bank-connections';
import { ConnectDialog } from '../components/connect-dialog';
import { ConnectionTable } from '../components/connection-table';

export function BankConnectionsPage() {
  const connectionsQuery = usePollConnections();

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="TÍCH HỢP"
        title="Kết nối ngân hàng"
        description={
          <>
            Kết nối <span className="text-primary">Casso Flow</span> để tự động
            đồng bộ giao dịch ngân hàng.
          </>
        }
        icon={Landmark}
        actions={<ConnectDialog />}
      />
      <SectionCard>
        {connectionsQuery.isPending && (
          <p role="status" aria-live="polite">
            Đang tải kết nối ngân hàng…
          </p>
        )}
        {connectionsQuery.isError && (
          <p role="alert" aria-live="polite" className="text-destructive">
            Không thể tải kết nối ngân hàng.
          </p>
        )}
        {connectionsQuery.data && (
          <ConnectionTable connections={connectionsQuery.data.items} />
        )}
      </SectionCard>
    </div>
  );
}
```

- [ ] **Step 2: Run the existing regression tests**

Run: `npx vitest run apps/frontend/src/features/bank-connections`
Expected: PASS (no dedicated `bank-connections-page.spec.tsx` exists yet — this runs every spec in the feature, covering `ConnectionTable`/`ConnectDialog` consumers of this page)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/features/bank-connections/pages/bank-connections-page.tsx
git commit -m "feat: add icon and Card to Bank Connections page"
```

---

### Task 5: Copilot — `HeaderIcon` next to the title

**Files:**
- Modify: `apps/frontend/src/features/copilot/pages/copilot-page.tsx`

**Interfaces:**
- Consumes: `HeaderIcon` (already built in PR #311).

- [ ] **Step 1: Add imports**

Change:

```tsx
import { Permission, PlanId } from '@casso-ledger/shared-types';
import {
  Lock,
  Mail,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Sparkles,
  Square,
} from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
```

to:

```tsx
import { Permission, PlanId } from '@casso-ledger/shared-types';
import {
  Bot,
  Lock,
  Mail,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Sparkles,
  Square,
} from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HeaderIcon } from '@/components/layout/header-icon';
import { Button } from '@/components/ui/button';
```

- [ ] **Step 2: Add the icon next to the title**

Change:

```tsx
        <div className="mb-4 flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold sm:text-2xl">Copilot</h1>
          <UsageIndicator />
        </div>
```

to:

```tsx
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <HeaderIcon icon={Bot} />
            <h1 className="text-xl font-semibold sm:text-2xl">Copilot</h1>
          </div>
          <UsageIndicator />
        </div>
```

No other line in this file changes.

- [ ] **Step 3: Run the existing regression test**

Run: `npx vitest run apps/frontend/src/features/copilot/pages/copilot-page.spec.tsx`
Expected: PASS

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/copilot/pages/copilot-page.tsx
git commit -m "feat: add header icon to Copilot page"
```

---

### Task 6: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full frontend test suite**

Run: `pnpm --filter @casso-ledger/frontend test`
Expected: PASS, no regressions outside the files touched above

- [ ] **Step 2: Full type-check and lint**

Run: `npx tsc --noEmit` then `npx biome check .`
Expected: no errors (run `npx biome check --write .` and re-review the diff if formatting-only issues appear)

- [ ] **Step 3: Manually verify in the running app**

Start `pnpm dev:backend` and the frontend dev server. Visit: a customer detail page (icon next to name, back-link and 5 cards unchanged), a receivable detail page (icon next to invoice number, badges/actions/3 tabs unchanged, no Card added inside tabs), the Receivable Balance History page (icon on `PageHeading`, table now inside a bordered Card), Bank Connections (icon on `PageHeading`, table inside a bordered Card), and Copilot (icon next to "Copilot" title, chat UI otherwise unchanged). Confirm dark mode still reads correctly and nothing overflows on mobile width.

- [ ] **Step 4: Update the feature map**

Check `docs/wayfinder/feature-map.md` for an entry referencing issue #308. If one exists, update its status to `done` with the shipped date and PR reference once the PR is opened. If none exists, skip this step.

- [ ] **Step 5: Open the PR**

```bash
git push -u origin lengocanh2005it/issue-308-extend-icon-card-treatment
gh pr create --title "feat: extend icon and Card polish to detail pages, Bank Connections, and Copilot" --body "Closes #308"
```
