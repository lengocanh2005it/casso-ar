# Post-Login Page Icon/Card Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a header icon + `<Card>`-wrapped data region to the 6 post-login list pages (Customers, Receivables, Reminders, Reports, Settings, Exceptions) so they match the Dashboard's already-polished look (lucide icons, `Card`, `fade-up` animation).

**Architecture:** Add an optional `icon?: LucideIcon` prop to the two shared header components (`PageHeading`, `PageHeader`) — additive, no existing caller's output changes. Then, page by page, wrap the loading/error/empty/table region in `<Card>` with the existing `fade-up` animation token, leaving search/filter/pagination controls outside the card.

**Tech Stack:** React 19, lucide-react, shadcn/ui `Card` (`apps/frontend/src/components/ui/card.tsx`), Vitest + React Testing Library, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-08-21-post-login-page-icon-card-polish-design.md`

## Global Constraints

- Single `primary` (green) accent color for every module — no per-module color system (spec §2).
- Icon mapping is fixed: Customers→`Users`, Receivables→`Receipt`, Reminders→`Bell`, Reports→`BarChart3`, Settings→`Settings`, Exceptions→`FileSearch` (spec §2).
- No row-level icons in table bodies (deferred to #309, spec §6).
- Reuse the existing `fade-up` animation token from `apps/frontend/src/index.css` — do not add a new animation.
- Search inputs, filter controls, and pagination footers stay **outside** the new `<Card>` (spec §5).
- `AppearanceTab` is not touched (spec §2, §6).
- Biome: single quotes, semicolons, 2-space indent, no trailing commas (`CLAUDE.local.md`).
- `import type` for pure types; value imports for anything used in JSX/constructor position (`.claude/rules/typescript.md`).
- This is a presentational-only change — no new spec files for the per-page edits, only for `PageHeading`/`PageHeader` (spec §2 "Test depth").

---

### Task 1: `PageHeading` icon prop

**Files:**
- Modify: `apps/frontend/src/components/layout/page-heading.tsx`
- Test: `apps/frontend/src/components/layout/page-heading.spec.tsx` (new)

**Interfaces:**
- Produces (for Tasks 3, 4, 6, 7, 9 to consume): `PageHeadingProps.icon?: LucideIcon`, rendered as a `size-9` rounded box (`bg-primary/10 text-primary`) to the left of the eyebrow/title stack when passed; renders nothing extra when omitted.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/frontend/src/components/layout/page-heading.spec.tsx
import { Users } from 'lucide-react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageHeading } from './page-heading';

describe('PageHeading', () => {
  it('renders no icon when icon is omitted', () => {
    const { container } = render(
      <PageHeading eyebrow="EYEBROW" title="Title" />,
    );
    expect(container.querySelector('svg')).toBeNull();
  });

  it('renders the icon when provided', () => {
    const { container } = render(
      <PageHeading eyebrow="EYEBROW" title="Title" icon={Users} />,
    );
    expect(container.querySelector('svg')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run apps/frontend/src/components/layout/page-heading.spec.tsx`
Expected: FAIL — `icon` is not a valid prop on `PageHeadingProps` (TS error) / second test finds no `svg`.

- [ ] **Step 3: Implement the icon prop**

Replace the full contents of `apps/frontend/src/components/layout/page-heading.tsx`:

```tsx
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageHeadingProps {
  eyebrow: string;
  title: string;
  description?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  className?: string;
}

export function PageHeading({
  eyebrow,
  title,
  description,
  icon: Icon,
  actions,
  className,
}: PageHeadingProps) {
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="flex items-start gap-3">
        {Icon && (
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon aria-hidden="true" className="size-5" />
          </div>
        )}
        <div>
          <p className="text-sm font-medium text-primary">{eyebrow}</p>
          <h1 className="mt-1 text-balance text-2xl font-semibold tracking-tight">
            {title}
          </h1>
          {description ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {actions}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run apps/frontend/src/components/layout/page-heading.spec.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/components/layout/page-heading.tsx apps/frontend/src/components/layout/page-heading.spec.tsx
git commit -m "feat: add optional icon prop to PageHeading"
```

---

### Task 2: `PageHeader` icon prop

**Files:**
- Modify: `apps/frontend/src/components/layout/page-header.tsx`
- Test: `apps/frontend/src/components/layout/page-header.spec.tsx` (new)

**Interfaces:**
- Produces (for Task 8 to consume): `PageHeaderProps.icon?: LucideIcon`, same rendering convention as `PageHeading` (Task 1).

- [ ] **Step 1: Write the failing test**

```tsx
// apps/frontend/src/components/layout/page-header.spec.tsx
import { Settings } from 'lucide-react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageHeader } from './page-header';

describe('PageHeader', () => {
  it('renders no icon when icon is omitted', () => {
    const { container } = render(<PageHeader title="Title" />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('renders the icon when provided', () => {
    const { container } = render(
      <PageHeader title="Title" icon={Settings} />,
    );
    expect(container.querySelector('svg')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run apps/frontend/src/components/layout/page-header.spec.tsx`
Expected: FAIL — `icon` is not a valid prop on `PageHeaderProps`.

- [ ] **Step 3: Implement the icon prop**

Replace the full contents of `apps/frontend/src/components/layout/page-header.tsx`:

```tsx
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ThemeToggle } from './theme-toggle';

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: ReactNode;
  className?: string;
  hideThemeToggle?: boolean;
}

export function PageHeader({
  title,
  description,
  icon: Icon,
  actions,
  className,
  hideThemeToggle = false,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        'sticky top-0 z-10 border-b border-border bg-background px-4 py-4 text-foreground sm:px-6 lg:top-0',
        className,
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          {Icon && (
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon aria-hidden="true" className="size-5" />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-foreground sm:text-xl">
              {title}
            </h1>
            {description ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 self-stretch sm:w-auto sm:shrink-0 sm:self-auto sm:justify-end">
          {actions}
          {!hideThemeToggle ? (
            <ThemeToggle className="hidden lg:inline-flex" />
          ) : null}
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run apps/frontend/src/components/layout/page-header.spec.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/components/layout/page-header.tsx apps/frontend/src/components/layout/page-header.spec.tsx
git commit -m "feat: add optional icon prop to PageHeader"
```

---

### Task 3: Customers page — icon + Card

**Files:**
- Modify: `apps/frontend/src/features/customers/pages/customers-page.tsx`

**Interfaces:**
- Consumes: `PageHeading` with `icon` (Task 1), `Card`/`CardContent` from `@/components/ui/card`.

- [ ] **Step 1: Add imports**

In `apps/frontend/src/features/customers/pages/customers-page.tsx`, add after the existing imports:

```tsx
import { Users } from 'lucide-react';
```

and change:

```tsx
import { Button } from '@/components/ui/button';
```

to:

```tsx
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
```

- [ ] **Step 2: Pass the icon and wrap the data region**

Change:

```tsx
      <PageHeading
        eyebrow="QUẢN LÝ KHÁCH HÀNG"
        title="Khách hàng"
        description="Quản lý thông tin và danh sách khách hàng."
      />
```

to:

```tsx
      <PageHeading
        eyebrow="QUẢN LÝ KHÁCH HÀNG"
        title="Khách hàng"
        description="Quản lý thông tin và danh sách khách hàng."
        icon={Users}
      />
```

Change:

```tsx
      {isPending && (
        <p role="status" aria-live="polite">
          Đang tải danh sách khách hàng…
        </p>
      )}
      {isError && (
        <p role="alert" aria-live="polite" className="text-destructive">
          Không thể tải danh sách khách hàng.
        </p>
      )}
      {data && <CustomerTable customers={data.items} />}
```

to:

```tsx
      <Card className="animate-fade-up motion-reduce:animate-none">
        <CardContent>
          {isPending && (
            <p role="status" aria-live="polite">
              Đang tải danh sách khách hàng…
            </p>
          )}
          {isError && (
            <p role="alert" aria-live="polite" className="text-destructive">
              Không thể tải danh sách khách hàng.
            </p>
          )}
          {data && <CustomerTable customers={data.items} />}
        </CardContent>
      </Card>
```

- [ ] **Step 3: Run the existing regression test**

Run: `npx vitest run apps/frontend/src/features/customers/pages/customers-page.spec.tsx`
Expected: PASS (no assertions target the removed plain-text wrapper, only content/role queries)

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/customers/pages/customers-page.tsx
git commit -m "feat: add icon and Card to Customers page"
```

---

### Task 4: Receivables page — icon + Card

**Files:**
- Modify: `apps/frontend/src/features/receivables/pages/receivables-page.tsx`

**Interfaces:**
- Consumes: `PageHeading` with `icon` (Task 1), `Card`/`CardContent` from `@/components/ui/card`.

- [ ] **Step 1: Add imports**

Add:

```tsx
import { Receipt } from 'lucide-react';
```

Change:

```tsx
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
```

to:

```tsx
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
```

- [ ] **Step 2: Pass the icon**

Add `icon={Receipt}` to the `<PageHeading eyebrow="QUẢN LÝ CÔNG NỢ" title="Công nợ" ...>` call (same position as Task 3, right after `description`).

- [ ] **Step 3: Wrap the data region**

Change:

```tsx
      {isPending && <TableSkeleton rows={5} />}
      {isError && (
        <p role="status" aria-live="polite" className="text-destructive">
          Không thể tải danh sách công nợ. Vui lòng thử lại.
        </p>
      )}
      {data && (
        <ReceivableTable
          receivables={data.items}
          selectedIds={bulkSelection.selectedIds}
          onToggle={bulkSelection.toggle}
          onToggleAll={bulkSelection.toggleAll}
          allSelected={bulkSelection.allSelected}
        />
      )}
```

to:

```tsx
      <Card className="animate-fade-up motion-reduce:animate-none">
        <CardContent>
          {isPending && <TableSkeleton rows={5} />}
          {isError && (
            <p role="status" aria-live="polite" className="text-destructive">
              Không thể tải danh sách công nợ. Vui lòng thử lại.
            </p>
          )}
          {data && (
            <ReceivableTable
              receivables={data.items}
              selectedIds={bulkSelection.selectedIds}
              onToggle={bulkSelection.toggle}
              onToggleAll={bulkSelection.toggleAll}
              allSelected={bulkSelection.allSelected}
            />
          )}
        </CardContent>
      </Card>
```

`<ReceivablesBulkActionBar>` and the pagination footer stay where they are, after this block, unchanged.

- [ ] **Step 4: Run the existing regression test**

Run: `npx vitest run apps/frontend/src/features/receivables/pages/receivables-page.spec.tsx`
Expected: PASS

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/receivables/pages/receivables-page.tsx
git commit -m "feat: add icon and Card to Receivables page"
```

---

### Task 5: Exceptions page — icon + Card

**Files:**
- Modify: `apps/frontend/src/features/exceptions/pages/exceptions-page.tsx`

**Interfaces:**
- Consumes: `PageHeading` with `icon` (Task 1), `Card`/`CardContent` from `@/components/ui/card`.

- [ ] **Step 1: Add imports**

Add:

```tsx
import { FileSearch } from 'lucide-react';
```

Change:

```tsx
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
```

to:

```tsx
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
```

- [ ] **Step 2: Pass the icon**

Add `icon={FileSearch}` to the `<PageHeading eyebrow="CẦN XỬ LÝ" title="Hàng chờ xử lý ngoại lệ" ...>` call.

- [ ] **Step 3: Wrap the data region**

Change (the block spanning the pending/error/empty-state/table checks):

```tsx
      {isPending && <TableSkeleton rows={5} />}
      {isError && (
        <p role="status" aria-live="polite" className="text-destructive">
          Không thể tải danh sách giao dịch cần xử lý. Vui lòng thử lại.
        </p>
      )}
      {data && data.items.length === 0 && (
        <p
          role="status"
          aria-live="polite"
          className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground"
        >
          {search
            ? 'Không tìm thấy giao dịch phù hợp.'
            : 'Không có giao dịch cần xử lý.'}
        </p>
      )}
      {data && data.items.length > 0 && (
        <Table>
```

to:

```tsx
      <Card className="animate-fade-up motion-reduce:animate-none">
        <CardContent>
          {isPending && <TableSkeleton rows={5} />}
          {isError && (
            <p role="status" aria-live="polite" className="text-destructive">
              Không thể tải danh sách giao dịch cần xử lý. Vui lòng thử lại.
            </p>
          )}
          {data && data.items.length === 0 && (
            <p
              role="status"
              aria-live="polite"
              className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground"
            >
              {search
                ? 'Không tìm thấy giao dịch phù hợp.'
                : 'Không có giao dịch cần xử lý.'}
            </p>
          )}
          {data && data.items.length > 0 && (
            <Table>
```

and close the new `<Card><CardContent>` after the existing `</Table>` closing block — i.e. change:

```tsx
          </TableBody>
        </Table>
      )}
      {data && (
        <ExceptionsBulkActionBar
```

to:

```tsx
          </TableBody>
        </Table>
          )}
        </CardContent>
      </Card>
      {data && (
        <ExceptionsBulkActionBar
```

(re-indent the moved lines to match the file's 2-space convention when editing — the snippet above shows the logical structure, not final indentation).

- [ ] **Step 4: Run the existing regression test**

Run: `npx vitest run apps/frontend/src/features/exceptions/pages/exceptions-page.spec.tsx`
Expected: PASS

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/exceptions/pages/exceptions-page.tsx
git commit -m "feat: add icon and Card to Exceptions page"
```

---

### Task 6: Reminders page — icon + two Cards

**Files:**
- Modify: `apps/frontend/src/features/reminders/pages/reminders-page.tsx`

**Interfaces:**
- Consumes: `PageHeading` with `icon` (Task 1), `Card`/`CardContent`/`CardDescription`/`CardHeader`/`CardTitle` from `@/components/ui/card`.

- [ ] **Step 1: Add imports**

Add:

```tsx
import { Bell, History } from 'lucide-react';
```

Change:

```tsx
import { PageHeading } from '@/components/layout/page-heading';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
```

to:

```tsx
import { PageHeading } from '@/components/layout/page-heading';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
```

- [ ] **Step 2: Pass the page icon**

Add `icon={Bell}` to the `<PageHeading eyebrow="TỰ ĐỘNG HÓA" title="Lịch nhắc" ...>` call.

- [ ] **Step 3: Convert the two `<section>` blocks to `<Card>`**

Change:

```tsx
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Chính sách nhắc</h2>
        {policiesPending && (
          <p role="status" aria-live="polite">
            Đang tải chính sách…
          </p>
        )}
        {policiesError && (
          <p role="alert" aria-live="polite" className="text-destructive">
            Không thể tải chính sách nhắc.
          </p>
        )}
        {policies && <PolicyTable policies={policies} onEdit={openEdit} />}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Lịch sử thực thi</h2>
          <p className="text-sm text-muted-foreground">
            Tra cứu các lần gửi hoặc bỏ qua email nhắc.
          </p>
        </div>
        <Input
          name="receivableId"
          autoComplete="off"
          aria-label="Lọc theo mã khoản phải thu"
          placeholder="Lọc theo mã khoản phải thu…"
          value={receivableId}
          onChange={(event) =>
            setParam('receivableId', event.target.value, { replace: true })
          }
          className="max-w-sm"
        />
        {executionsQuery.isPending && (
          <p role="status" aria-live="polite">
            Đang tải lịch sử thực thi…
          </p>
        )}
        {executionsQuery.isError && (
          <p role="alert" aria-live="polite" className="text-destructive">
            Không thể tải lịch sử thực thi.
          </p>
        )}
        {executionsQuery.data && (
          <ExecutionsTable executions={executionsQuery.data.items} />
        )}
      </section>
```

to:

```tsx
      <Card className="animate-fade-up motion-reduce:animate-none">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="size-4 text-primary" />
            <CardTitle>Chính sách nhắc</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {policiesPending && (
            <p role="status" aria-live="polite">
              Đang tải chính sách…
            </p>
          )}
          {policiesError && (
            <p role="alert" aria-live="polite" className="text-destructive">
              Không thể tải chính sách nhắc.
            </p>
          )}
          {policies && <PolicyTable policies={policies} onEdit={openEdit} />}
        </CardContent>
      </Card>

      <Card className="animate-fade-up motion-reduce:animate-none [animation-delay:40ms]">
        <CardHeader>
          <div className="flex items-center gap-2">
            <History className="size-4 text-primary" />
            <CardTitle>Lịch sử thực thi</CardTitle>
          </div>
          <CardDescription>
            Tra cứu các lần gửi hoặc bỏ qua email nhắc.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            name="receivableId"
            autoComplete="off"
            aria-label="Lọc theo mã khoản phải thu"
            placeholder="Lọc theo mã khoản phải thu…"
            value={receivableId}
            onChange={(event) =>
              setParam('receivableId', event.target.value, { replace: true })
            }
            className="max-w-sm"
          />
          {executionsQuery.isPending && (
            <p role="status" aria-live="polite">
              Đang tải lịch sử thực thi…
            </p>
          )}
          {executionsQuery.isError && (
            <p role="alert" aria-live="polite" className="text-destructive">
              Không thể tải lịch sử thực thi.
            </p>
          )}
          {executionsQuery.data && (
            <ExecutionsTable executions={executionsQuery.data.items} />
          )}
        </CardContent>
      </Card>
```

- [ ] **Step 4: Run the existing regression test**

Run: `npx vitest run apps/frontend/src/features/reminders/pages/reminders-page.spec.tsx`
Expected: PASS

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/reminders/pages/reminders-page.tsx
git commit -m "feat: add icon and Card sections to Reminders page"
```

---

### Task 7: Reports page — icon only

**Files:**
- Modify: `apps/frontend/src/features/reports/pages/reports-page.tsx`

**Interfaces:**
- Consumes: `PageHeading` with `icon` (Task 1). No structural change — every section already uses `<Card>`.

- [ ] **Step 1: Add the import**

Change:

```tsx
import { lazy, Suspense, useEffect } from 'react';
import { PageHeading } from '@/components/layout/page-heading';
```

to:

```tsx
import { BarChart3 } from 'lucide-react';
import { lazy, Suspense, useEffect } from 'react';
import { PageHeading } from '@/components/layout/page-heading';
```

- [ ] **Step 2: Pass the icon**

Add `icon={BarChart3}` to the `<PageHeading eyebrow="PHÂN TÍCH" title="Báo cáo" ...>` call.

- [ ] **Step 3: Run the existing regression test**

Run: `npx vitest run apps/frontend/src/features/reports/pages/reports-page.spec.tsx`
Expected: PASS

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/reports/pages/reports-page.tsx
git commit -m "feat: add icon to Reports page heading"
```

---

### Task 8: Settings page — icon on `PageHeader`

**Files:**
- Modify: `apps/frontend/src/features/settings/pages/settings-page.tsx`

**Interfaces:**
- Consumes: `PageHeader` with `icon` (Task 2).

- [ ] **Step 1: Add the import**

Change:

```tsx
import { Permission } from '@casso-ledger/shared-types';
import { CreditCard, Lock, Mail, Palette, Server, Users } from 'lucide-react';
```

to:

```tsx
import { Permission } from '@casso-ledger/shared-types';
import {
  CreditCard,
  Lock,
  Mail,
  Palette,
  Server,
  Settings as SettingsIcon,
  Users,
} from 'lucide-react';
```

(aliased to `SettingsIcon` to avoid shadowing the `SettingsPage` component name and any future `Settings` import.)

- [ ] **Step 2: Pass the icon**

Change:

```tsx
      <PageHeader
        title="Cài đặt"
        description="Quản lý tài khoản và cấu hình hệ thống"
      />
```

to:

```tsx
      <PageHeader
        title="Cài đặt"
        description="Quản lý tài khoản và cấu hình hệ thống"
        icon={SettingsIcon}
      />
```

- [ ] **Step 3: Run the existing regression test**

Run: `npx vitest run apps/frontend/src/features/settings/pages/settings-page.spec.tsx`
Expected: PASS (if the spec file doesn't exist yet, run `npx vitest run apps/frontend/src/features/settings` instead and confirm no failures)

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/settings/pages/settings-page.tsx
git commit -m "feat: add icon to Settings page header"
```

---

### Task 9: `UsersTab` + `PendingInvitesTable` — Card wrap

**Files:**
- Modify: `apps/frontend/src/features/settings/components/users-tab.tsx`
- Modify: `apps/frontend/src/features/settings/components/pending-invites-table.tsx`

**Interfaces:** none new — both files only gain `<Card>` markup around their existing table region.

- [ ] **Step 1: Add imports to `users-tab.tsx`**

Change:

```tsx
import { Permission, Role } from '@casso-ledger/shared-types';
import { memo, useCallback, useState } from 'react';
```

to:

```tsx
import { Permission, Role } from '@casso-ledger/shared-types';
import { Users } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
```

Change:

```tsx
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
```

to:

```tsx
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
```

- [ ] **Step 2: Wrap the members section in `users-tab.tsx`**

Change:

```tsx
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Thành viên</h2>
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as StatusFilter)}
          >
            <SelectTrigger aria-label="Lọc theo trạng thái">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>{statusFilterItems}</SelectContent>
          </Select>
        </div>
        {membersQuery.isPending && membersLoadingMessage}
        {membersQuery.isError && membersErrorMessage}
        {membersQuery.data && (
          <MembersTable
            members={filteredMembers}
            emptyMessage={emptyMessage}
            canManage={canManage}
            canBlock={canBlock}
            currentUserId={user?.id}
            onRoleChange={handleRoleChange}
            onRemove={handleRemove}
            onBlock={handleBlock}
            onUnblock={handleUnblock}
          />
        )}
      </div>
```

to:

```tsx
      <Card className="animate-fade-up motion-reduce:animate-none">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="size-4 text-primary" />
            <CardTitle>Thành viên</CardTitle>
          </div>
          <CardAction>
            <Select
              value={statusFilter}
              onValueChange={(value) =>
                setStatusFilter(value as StatusFilter)
              }
            >
              <SelectTrigger aria-label="Lọc theo trạng thái">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>{statusFilterItems}</SelectContent>
            </Select>
          </CardAction>
        </CardHeader>
        <CardContent>
          {membersQuery.isPending && membersLoadingMessage}
          {membersQuery.isError && membersErrorMessage}
          {membersQuery.data && (
            <MembersTable
              members={filteredMembers}
              emptyMessage={emptyMessage}
              canManage={canManage}
              canBlock={canBlock}
              currentUserId={user?.id}
              onRoleChange={handleRoleChange}
              onRemove={handleRemove}
              onBlock={handleBlock}
              onUnblock={handleUnblock}
            />
          )}
        </CardContent>
      </Card>
```

- [ ] **Step 3: Add imports to `pending-invites-table.tsx`**

Change:

```tsx
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
```

to:

```tsx
import { MailPlus } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
```

- [ ] **Step 4: Wrap the table in `pending-invites-table.tsx`**

Change:

```tsx
  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold">Lời mời đang chờ</h2>
      {invitesQuery.isPending && (
```

to:

```tsx
  return (
    <Card className="animate-fade-up motion-reduce:animate-none [animation-delay:40ms]">
      <CardHeader>
        <div className="flex items-center gap-2">
          <MailPlus className="size-4 text-primary" />
          <CardTitle>Lời mời đang chờ</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
      {invitesQuery.isPending && (
```

(the extra leading whitespace on the moved lines is corrected during the actual edit to match 2-space indentation)

and change the closing tags at the end of the function from:

```tsx
        </Table>
      )}
    </div>
  );
}
```

to:

```tsx
        </Table>
      )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Run the existing regression tests**

Run: `npx vitest run apps/frontend/src/features/settings/components/users-tab.spec.tsx apps/frontend/src/features/settings/components/pending-invites-table.spec.tsx`
Expected: PASS (if either spec file doesn't exist, run `npx vitest run apps/frontend/src/features/settings` and confirm no failures)

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/settings/components/users-tab.tsx apps/frontend/src/features/settings/components/pending-invites-table.tsx
git commit -m "feat: add icon and Card to Users settings tab"
```

---

### Task 10: `EmailTemplatesTab` — Card wrap

**Files:**
- Modify: `apps/frontend/src/features/settings/components/email-templates-tab.tsx`

**Interfaces:** none new.

- [ ] **Step 1: Add imports**

Change:

```tsx
import { Permission } from '@casso-ledger/shared-types';
import { useState } from 'react';
```

to:

```tsx
import { Permission } from '@casso-ledger/shared-types';
import { Mail } from 'lucide-react';
import { useState } from 'react';
```

Change:

```tsx
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
```

to:

```tsx
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
```

- [ ] **Step 2: Wrap the header and data region**

Change:

```tsx
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Mẫu email</h2>
          <p className="text-sm text-muted-foreground">
            Quản lý nội dung email dùng trong các chính sách nhắc.
          </p>
        </div>
        {canWrite && (
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            Tạo mẫu email
          </Button>
        )}
      </div>
      {templatesQuery.isPending && (
```

to:

```tsx
  return (
    <Card className="animate-fade-up motion-reduce:animate-none">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Mail className="size-4 text-primary" />
          <CardTitle>Mẫu email</CardTitle>
        </div>
        <CardDescription>
          Quản lý nội dung email dùng trong các chính sách nhắc.
        </CardDescription>
        {canWrite && (
          <CardAction>
            <Button
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              Tạo mẫu email
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
      {templatesQuery.isPending && (
```

(again, indentation of the moved block is corrected during the actual edit)

Change the closing structure from:

```tsx
      {canWrite && (
        <>
          <TemplateDialog
            template={editing}
            open={dialogOpen}
            onOpenChange={setDialogOpen}
          />
          <TemplatePreviewDialog
            template={previewing}
            open={previewing !== null}
            onOpenChange={(open) => {
              if (!open) setPreviewing(null);
            }}
          />
        </>
      )}
    </div>
  );
}
```

to:

```tsx
      {canWrite && (
        <>
          <TemplateDialog
            template={editing}
            open={dialogOpen}
            onOpenChange={setDialogOpen}
          />
          <TemplatePreviewDialog
            template={previewing}
            open={previewing !== null}
            onOpenChange={(open) => {
              if (!open) setPreviewing(null);
            }}
          />
        </>
      )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Run the existing regression test**

Run: `npx vitest run apps/frontend/src/features/settings/components/email-templates-tab.spec.tsx`
Expected: PASS

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/settings/components/email-templates-tab.tsx
git commit -m "feat: add icon and Card to Email Templates settings tab"
```

---

### Task 11: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full frontend test suite**

Run: `pnpm --filter @casso-ledger/frontend test`
Expected: PASS, no regressions outside the files touched above

- [ ] **Step 2: Full type-check and lint**

Run: `npx tsc --noEmit` then `npx biome check .`
Expected: no errors (run `npx biome check --write .` and re-review the diff if formatting-only issues appear)

- [ ] **Step 3: Manually verify in the running app**

Start `pnpm dev:backend` and the frontend dev server, log in, and visit each of the 6 pages (Customers, Receivables, Reminders, Reports, Settings — Users tab and Email Templates tab, Exceptions). Confirm: each `PageHeading`/`PageHeader` shows its icon, each table sits inside a visibly bordered `Card`, the card fades in on load, dark mode (`ThemeToggle`) still reads correctly, and no layout overflow appears on mobile width.

- [ ] **Step 4: Update the feature map**

Check `docs/wayfinder/feature-map.md` for an entry referencing issue #307. If one exists, update its status to `done` with the shipped date and PR reference once the PR is opened. If no entry exists, skip this step — this is a UI polish pass triggered directly by user feedback, not a pre-planned wayfinder ticket.

- [ ] **Step 5: Open the PR**

```bash
git push -u origin lengocanh2005it/issue-307-polish-post-login-ui
gh pr create --title "feat: add icon and Card polish to post-login list pages" --body "Closes #307"
```
