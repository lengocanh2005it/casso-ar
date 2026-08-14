# Casso Admin Platform Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the 4 admin-only pages (login, dashboard, organizations, AI usage) as their own visually distinct console within the existing Casso Ledger frontend, per the FE design spec.

**Architecture:** New `features/admin/` folder (own `api/`, `components/`, `pages/`) plus one new layout (`components/layout/admin-layout.tsx`). Reuses the app's existing token system and `shadcn/ui` primitives; the one new primitive (`BreakerSwitch`) is a plain styled button, no new dependency. Route guard decodes the JWT client-side (no `/me` call — an Operator may have no `organizationId`).

**Tech Stack:** React 19, React Router, `recharts` (existing dependency), Tailwind v4, existing `shadcn/ui` components.

**Spec:** `docs/superpowers/specs/2026-08-14-casso-admin-platform-fe-design.md` (visual/UX design) and `docs/superpowers/specs/2026-08-14-casso-admin-platform-design.md` (API contracts this FE consumes — already implemented per `docs/superpowers/plans/2026-08-14-casso-admin-platform.md` Tasks 1-10).

This plan **supersedes** Tasks 11-14 of `docs/superpowers/plans/2026-08-14-casso-admin-platform.md` — do not implement those; implement this plan's tasks instead for the frontend.

## Global Constraints

- Money: not applicable (no money fields on these pages).
- All API calls use the `/api/v1` prefix via `lib/api-client.ts`.
- No `any` in production code.
- Feature folder contains its own `api/`, `components/`, `pages/` (per `apps/frontend/src/features/<feature>/` convention).
- No new color tokens — reuse `--primary`/`--destructive`/`--muted`/`--border`/`--chart-1`/`--chart-2` from `apps/frontend/src/index.css`.
- No new npm dependency for this plan (no Radix `Switch`, no new icon set).
- Biome: single quotes, semicolons, 2-space indent, no trailing commas.
- Test command: `pnpm --filter @casso-ledger/frontend test -- <pattern>`, type check: `npx tsc --noEmit` (frontend project).

---

## Task 1: `admin-api.ts` + operator token helper + `AdminRoute` guard

**Files:**
- Create: `apps/frontend/src/features/admin/api/admin-api.ts`
- Modify: `apps/frontend/src/lib/api-client.ts`
- Create: `apps/frontend/src/routes/admin-route.tsx`
- Create: `apps/frontend/src/routes/admin-route.spec.tsx`

**Interfaces:**
- Produces: `isOperatorToken(token: string): boolean` (exported from `lib/api-client.ts`)
- Produces: `AdminRoute` component
- Produces: `adminLogin`, `listOrganizations`, `lockOrganization`, `unlockOrganization`, `getAiUsage`, `getAiUsageTrend` from `admin-api.ts`, matching the endpoints in the BE spec

- [ ] **Step 1: Write the failing test for `AdminRoute`**

```typescript
// apps/frontend/src/routes/admin-route.spec.tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { authTokenManager } from '@/lib/api-client';
import { AdminRoute } from './admin-route';

function buildToken(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'none' }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.`;
}

describe('AdminRoute', () => {
  it('renders children when the current token has isOperator=true', () => {
    authTokenManager.setAccessToken(
      buildToken({ isOperator: true, exp: Date.now() / 1000 + 3600 }),
    );

    render(
      <MemoryRouter initialEntries={['/admin/dashboard']}>
        <Routes>
          <Route path="/admin/dashboard" element={<AdminRoute>ok</AdminRoute>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('ok')).toBeInTheDocument();
  });

  it('redirects to /admin/login when there is no operator token', () => {
    authTokenManager.setAccessToken(null);

    render(
      <MemoryRouter initialEntries={['/admin/dashboard']}>
        <Routes>
          <Route path="/admin/dashboard" element={<AdminRoute>ok</AdminRoute>} />
          <Route path="/admin/login" element={<div>login</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('login')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/frontend test -- admin-route`
Expected: FAIL — `admin-route.tsx` does not exist.

- [ ] **Step 3: Add `isOperatorToken` to `api-client.ts`**

```typescript
// apps/frontend/src/lib/api-client.ts
// Replace the existing JwtPayload interface and getTokenExpiry function with:

interface JwtPayload {
  exp?: unknown;
  isOperator?: unknown;
}

function decodeJwtPayload(token: string): JwtPayload | null {
  const encodedPayload = token.split('.')[1];
  if (!encodedPayload) return null;
  try {
    const normalizedPayload = encodedPayload
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const paddedPayload = normalizedPayload.padEnd(
      Math.ceil(normalizedPayload.length / 4) * 4,
      '=',
    );
    return JSON.parse(atob(paddedPayload)) as JwtPayload;
  } catch {
    return null;
  }
}

function getTokenExpiry(token: string): number | null {
  const payload = decodeJwtPayload(token);
  return payload && typeof payload.exp === 'number' ? payload.exp * 1000 : null;
}

export function isOperatorToken(token: string): boolean {
  return decodeJwtPayload(token)?.isOperator === true;
}
```

Keep every other export in the file (`AuthTokenManager`, `apiRequest`, etc.) unchanged.

- [ ] **Step 4: Implement `AdminRoute`**

```typescript
// apps/frontend/src/routes/admin-route.tsx
import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { authTokenManager, isOperatorToken } from '@/lib/api-client';

export function AdminRoute({ children }: { children: ReactNode }) {
  const token = authTokenManager.getAccessToken();
  if (!token || !isOperatorToken(token)) {
    return <Navigate to="/admin/login" replace />;
  }
  return children;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/frontend test -- admin-route`
Expected: PASS

- [ ] **Step 6: `admin-api.ts`**

```typescript
// apps/frontend/src/features/admin/api/admin-api.ts
import { apiRequest, authTokenManager } from '@/lib/api-client';

export interface OrganizationListItem {
  id: string;
  name: string;
  status: 'ACTIVE' | 'LOCKED';
  createdAt: string;
}

export interface AiUsageAggregateItem {
  organizationId: string;
  organizationName: string;
  model: string;
  requestCount: number;
  totalTokens: number;
  errorCount: number;
}

export interface AiUsageTrendPoint {
  date: string;
  requestCount: number;
  totalTokens: number;
}

export async function adminLogin(email: string, password: string): Promise<void> {
  const result = await apiRequest<{ accessToken: string }>({
    url: '/api/v1/auth/login',
    method: 'POST',
    data: { email, password },
  });
  authTokenManager.setAccessToken(result.accessToken);
}

export function listOrganizations(
  page: number,
  limit: number,
): Promise<{ items: OrganizationListItem[]; total: number; page: number; limit: number }> {
  return apiRequest({ url: '/api/v1/admin/organizations', method: 'GET', params: { page, limit } });
}

export function lockOrganization(id: string): Promise<{ status: string }> {
  return apiRequest({ url: `/api/v1/admin/organizations/${id}/lock`, method: 'POST' });
}

export function unlockOrganization(id: string): Promise<{ status: string }> {
  return apiRequest({ url: `/api/v1/admin/organizations/${id}/unlock`, method: 'POST' });
}

export function getAiUsage(from: string, to: string): Promise<{ items: AiUsageAggregateItem[] }> {
  return apiRequest({ url: '/api/v1/admin/ai-usage', method: 'GET', params: { from, to } });
}

export function getAiUsageTrend(from: string, to: string): Promise<{ items: AiUsageTrendPoint[] }> {
  return apiRequest({ url: '/api/v1/admin/ai-usage/trend', method: 'GET', params: { from, to } });
}
```

- [ ] **Step 7: Type check**

Run: `npx tsc --noEmit` (frontend project)
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/features/admin/api/admin-api.ts apps/frontend/src/lib/api-client.ts apps/frontend/src/routes/admin-route.tsx apps/frontend/src/routes/admin-route.spec.tsx
git commit -m "feat: add admin API client, operator token helper, and route guard"
```

---

## Task 2: `BreakerSwitch` (signature component)

**Files:**
- Create: `apps/frontend/src/features/admin/components/breaker-switch.tsx`
- Create: `apps/frontend/src/features/admin/components/breaker-switch.spec.tsx`

**Interfaces:**
- Produces: `BreakerSwitch({ checked, onCheckedChange, label }): JSX.Element` — `role="switch"`, `aria-checked`, `aria-label`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/features/admin/components/breaker-switch.spec.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BreakerSwitch } from './breaker-switch';

describe('BreakerSwitch', () => {
  it('renders as a switch with the given aria-checked state and label', () => {
    render(<BreakerSwitch checked={false} onCheckedChange={() => {}} label="Lock Acme" />);
    const el = screen.getByRole('switch', { name: 'Lock Acme' });
    expect(el).toHaveAttribute('aria-checked', 'false');
  });

  it('calls onCheckedChange when clicked', async () => {
    const onCheckedChange = jest.fn();
    render(<BreakerSwitch checked={false} onCheckedChange={onCheckedChange} label="Lock Acme" />);
    await userEvent.click(screen.getByRole('switch', { name: 'Lock Acme' }));
    expect(onCheckedChange).toHaveBeenCalledTimes(1);
  });

  it('reflects checked=true as aria-checked=true', () => {
    render(<BreakerSwitch checked={true} onCheckedChange={() => {}} label="Unlock Acme" />);
    expect(screen.getByRole('switch', { name: 'Unlock Acme' })).toHaveAttribute('aria-checked', 'true');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/frontend test -- breaker-switch`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Implement `BreakerSwitch`**

```typescript
// apps/frontend/src/features/admin/components/breaker-switch.tsx
import { cn } from '@/lib/utils';

interface BreakerSwitchProps {
  checked: boolean;
  onCheckedChange: () => void;
  label: string;
}

export function BreakerSwitch({ checked, onCheckedChange, label }: BreakerSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onCheckedChange}
      className={cn(
        'relative h-8 w-14 rounded-full border-2 transition-colors duration-200 motion-reduce:transition-none',
        'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        checked
          ? 'border-destructive bg-destructive/20 shadow-[0_0_10px] shadow-destructive/60'
          : 'border-border bg-muted',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 size-6 rounded-full shadow transition-transform duration-200 motion-reduce:transition-none',
          checked ? 'translate-x-6 bg-destructive' : 'translate-x-0.5 bg-primary',
        )}
      />
    </button>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/frontend test -- breaker-switch`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/admin/components/breaker-switch.tsx apps/frontend/src/features/admin/components/breaker-switch.spec.tsx
git commit -m "feat: add BreakerSwitch signature component"
```

---

## Task 3: `AdminStatusRail` + `AdminLayout`

**Files:**
- Create: `apps/frontend/src/features/admin/components/admin-status-rail.tsx`
- Create: `apps/frontend/src/features/admin/components/admin-status-rail.spec.tsx`
- Create: `apps/frontend/src/components/layout/admin-layout.tsx`

**Interfaces:**
- Consumes: `listOrganizations` (Task 1)
- Produces: `AdminStatusRail` component, `AdminLayout` component (wraps `<Outlet />`)

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/features/admin/components/admin-status-rail.spec.tsx
import { render, screen } from '@testing-library/react';
import * as adminApi from '../api/admin-api';
import { AdminStatusRail } from './admin-status-rail';

jest.mock('../api/admin-api');

describe('AdminStatusRail', () => {
  it('shows total org count and locked count from listOrganizations', async () => {
    jest.spyOn(adminApi, 'listOrganizations').mockResolvedValue({
      items: [
        { id: 'org-1', name: 'Acme', status: 'LOCKED', createdAt: '2026-08-01T00:00:00.000Z' },
        { id: 'org-2', name: 'Beta', status: 'ACTIVE', createdAt: '2026-08-01T00:00:00.000Z' },
      ],
      total: 2,
      page: 1,
      limit: 100,
    });

    render(<AdminStatusRail />);

    expect(await screen.findByText('2')).toBeInTheDocument();
    expect(await screen.findByText('1')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/frontend test -- admin-status-rail`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Implement `AdminStatusRail`**

```typescript
// apps/frontend/src/features/admin/components/admin-status-rail.tsx
import { useEffect, useState } from 'react';
import { listOrganizations } from '../api/admin-api';

export function AdminStatusRail() {
  const [total, setTotal] = useState<number | null>(null);
  const [locked, setLocked] = useState<number | null>(null);

  useEffect(() => {
    void listOrganizations(1, 100).then((result) => {
      setTotal(result.total);
      setLocked(result.items.filter((org) => org.status === 'LOCKED').length);
    });
  }, []);

  return (
    <div className="flex items-center gap-4 border-b border-border bg-muted/40 px-4 py-2 text-sm">
      <span className="flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-primary" aria-hidden />
        <span className="font-mono tabular-nums">{total ?? '–'}</span> organizations
      </span>
      {locked !== null && locked > 0 && (
        <span className="flex items-center gap-1.5 text-destructive">
          <span aria-hidden>⚠</span>
          <span className="font-mono tabular-nums">{locked}</span> locked
        </span>
      )}
      <span className="ml-auto font-medium text-muted-foreground">Casso Admin</span>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/frontend test -- admin-status-rail`
Expected: PASS

- [ ] **Step 5: Implement `AdminLayout` (no test — pure composition, covered by route-level tests in Task 6)**

```typescript
// apps/frontend/src/components/layout/admin-layout.tsx
import { NavLink, Outlet } from 'react-router-dom';
import { AdminStatusRail } from '@/features/admin/components/admin-status-rail';

function navLinkClassName({ isActive }: { isActive: boolean }): string {
  return isActive ? 'font-medium text-primary' : 'text-muted-foreground';
}

export function AdminLayout() {
  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-background">
      <AdminStatusRail />
      <nav className="flex gap-4 border-b border-border px-4 py-2 text-sm">
        <NavLink to="/admin/dashboard" className={navLinkClassName}>
          Dashboard
        </NavLink>
        <NavLink to="/admin/organizations" className={navLinkClassName}>
          Organizations
        </NavLink>
        <NavLink to="/admin/ai-usage" className={navLinkClassName}>
          AI Usage
        </NavLink>
      </nav>
      <main className="flex-1 overflow-auto p-4 md:p-6">
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 6: Type check**

Run: `npx tsc --noEmit` (frontend project)
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/admin/components/admin-status-rail.tsx apps/frontend/src/features/admin/components/admin-status-rail.spec.tsx apps/frontend/src/components/layout/admin-layout.tsx
git commit -m "feat: add AdminStatusRail and AdminLayout"
```

---

## Task 4: `AdminLoginPage`

**Files:**
- Create: `apps/frontend/src/features/admin/pages/admin-login-page.tsx`

**Interfaces:**
- Consumes: `adminLogin` (Task 1)
- Produces: `AdminLoginPage` component

No dedicated test for this task — it is a thin form wrapping `adminLogin` with local `useState`, no branching logic beyond try/catch; covered functionally by Task 6's route wiring. (Exception per AGENTS.md testing rules: trivial glue code.)

- [ ] **Step 1: Implement `AdminLoginPage`**

```typescript
// apps/frontend/src/features/admin/pages/admin-login-page.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { adminLogin } from '../api/admin-api';

export function AdminLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await adminLogin(email, password);
      navigate('/admin/dashboard', { replace: true });
    } catch {
      setError('Đăng nhập thất bại.');
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-6">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="font-mono text-xl font-semibold">Casso Admin</h1>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Mật khẩu</Label>
          <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full">
          Đăng nhập
        </Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit` (frontend project)
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/features/admin/pages/admin-login-page.tsx
git commit -m "feat: add AdminLoginPage"
```

---

## Task 5: `AdminOrganizationsPage` (uses `BreakerSwitch`)

**Files:**
- Create: `apps/frontend/src/features/admin/pages/admin-organizations-page.tsx`
- Create: `apps/frontend/src/features/admin/pages/admin-organizations-page.spec.tsx`

**Interfaces:**
- Consumes: `listOrganizations`, `lockOrganization`, `unlockOrganization` (Task 1), `BreakerSwitch` (Task 2)

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/features/admin/pages/admin-organizations-page.spec.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as adminApi from '../api/admin-api';
import { AdminOrganizationsPage } from './admin-organizations-page';

jest.mock('../api/admin-api');

describe('AdminOrganizationsPage', () => {
  it('lists organizations and locks one via the breaker switch', async () => {
    jest.spyOn(adminApi, 'listOrganizations').mockResolvedValue({
      items: [{ id: 'org-1', name: 'Acme', status: 'ACTIVE', createdAt: '2026-08-01T00:00:00.000Z' }],
      total: 1,
      page: 1,
      limit: 100,
    });
    jest.spyOn(adminApi, 'lockOrganization').mockResolvedValue({ status: 'LOCKED' });

    render(<AdminOrganizationsPage />);

    expect(await screen.findByText('Acme')).toBeInTheDocument();
    const toggle = screen.getByRole('switch', { name: /acme/i });
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    await userEvent.click(toggle);

    await waitFor(() => expect(adminApi.lockOrganization).toHaveBeenCalledWith('org-1'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/frontend test -- admin-organizations-page`
Expected: FAIL — page does not exist.

- [ ] **Step 3: Implement `AdminOrganizationsPage`**

```typescript
// apps/frontend/src/features/admin/pages/admin-organizations-page.tsx
import { useEffect, useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  type OrganizationListItem,
  listOrganizations,
  lockOrganization,
  unlockOrganization,
} from '../api/admin-api';
import { BreakerSwitch } from '../components/breaker-switch';

export function AdminOrganizationsPage() {
  const [items, setItems] = useState<OrganizationListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  async function reload() {
    setIsLoading(true);
    const result = await listOrganizations(1, 100);
    setItems(result.items);
    setIsLoading(false);
  }

  useEffect(() => {
    void reload();
  }, []);

  async function handleToggle(org: OrganizationListItem) {
    if (org.status === 'ACTIVE') {
      await lockOrganization(org.id);
    } else {
      await unlockOrganization(org.id);
    }
    await reload();
  }

  if (isLoading) return <p>Đang tải...</p>;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Tên tổ chức</TableHead>
          <TableHead className="font-mono">ID</TableHead>
          <TableHead>Ngày tạo</TableHead>
          <TableHead>Trạng thái</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((org) => (
          <TableRow key={org.id}>
            <TableCell>{org.name}</TableCell>
            <TableCell className="font-mono text-xs text-muted-foreground">{org.id}</TableCell>
            <TableCell>{new Date(org.createdAt).toLocaleDateString('vi-VN')}</TableCell>
            <TableCell>
              <BreakerSwitch
                checked={org.status === 'LOCKED'}
                onCheckedChange={() => handleToggle(org)}
                label={org.status === 'ACTIVE' ? `Lock ${org.name}` : `Unlock ${org.name}`}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/frontend test -- admin-organizations-page`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/admin/pages/admin-organizations-page.tsx apps/frontend/src/features/admin/pages/admin-organizations-page.spec.tsx
git commit -m "feat: add AdminOrganizationsPage with breaker-switch lock control"
```

---

## Task 6: `AdminAiUsagePage`

**Files:**
- Create: `apps/frontend/src/features/admin/pages/admin-ai-usage-page.tsx`
- Create: `apps/frontend/src/features/admin/pages/admin-ai-usage-page.spec.tsx`

**Interfaces:**
- Consumes: `getAiUsage` (Task 1)

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/features/admin/pages/admin-ai-usage-page.spec.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as adminApi from '../api/admin-api';
import { AdminAiUsagePage } from './admin-ai-usage-page';

jest.mock('../api/admin-api');

describe('AdminAiUsagePage', () => {
  it('fetches and displays the breakdown after submitting a date range', async () => {
    jest.spyOn(adminApi, 'getAiUsage').mockResolvedValue({
      items: [
        {
          organizationId: 'org-1',
          organizationName: 'Acme',
          model: 'gpt-5.5',
          requestCount: 42,
          totalTokens: 1000,
          errorCount: 0,
        },
      ],
    });

    render(<AdminAiUsagePage />);

    await userEvent.type(screen.getByLabelText(/từ ngày/i), '2026-08-01');
    await userEvent.type(screen.getByLabelText(/đến ngày/i), '2026-08-07');
    await userEvent.click(screen.getByRole('button', { name: /xem/i }));

    await waitFor(() =>
      expect(adminApi.getAiUsage).toHaveBeenCalledWith('2026-08-01', '2026-08-07'),
    );
    expect(await screen.findByText('Acme')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/frontend test -- admin-ai-usage-page`
Expected: FAIL — page does not exist.

- [ ] **Step 3: Implement `AdminAiUsagePage`**

```typescript
// apps/frontend/src/features/admin/pages/admin-ai-usage-page.tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { type AiUsageAggregateItem, getAiUsage } from '../api/admin-api';

export function AdminAiUsagePage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [items, setItems] = useState<AiUsageAggregateItem[]>([]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const result = await getAiUsage(from, to);
    setItems(result.items);
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="flex items-end gap-3">
        <div className="space-y-2">
          <Label htmlFor="from">Từ ngày</Label>
          <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="to">Đến ngày</Label>
          <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} required />
        </div>
        <Button type="submit">Xem</Button>
      </form>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tổ chức</TableHead>
            <TableHead>Model</TableHead>
            <TableHead className="font-mono">Requests</TableHead>
            <TableHead className="font-mono">Tokens</TableHead>
            <TableHead className="font-mono">Lỗi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={`${item.organizationId}-${item.model}`}>
              <TableCell>{item.organizationName}</TableCell>
              <TableCell>{item.model}</TableCell>
              <TableCell className="font-mono tabular-nums">{item.requestCount}</TableCell>
              <TableCell className="font-mono tabular-nums">{item.totalTokens}</TableCell>
              <TableCell className="font-mono tabular-nums">{item.errorCount}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/frontend test -- admin-ai-usage-page`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/admin/pages/admin-ai-usage-page.tsx apps/frontend/src/features/admin/pages/admin-ai-usage-page.spec.tsx
git commit -m "feat: add AdminAiUsagePage"
```

---

## Task 7: `AdminDashboardPage` (charts)

**Files:**
- Create: `apps/frontend/src/features/admin/pages/admin-dashboard-page.tsx`
- Create: `apps/frontend/src/features/admin/pages/admin-dashboard-page.spec.tsx`

**Interfaces:**
- Consumes: `getAiUsage`, `getAiUsageTrend` (Task 1) — org/locked counts are already shown by `AdminStatusRail` (Task 3), so this page holds only the two charts, not duplicate count cards

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/features/admin/pages/admin-dashboard-page.spec.tsx
import { render, screen } from '@testing-library/react';
import * as adminApi from '../api/admin-api';
import { AdminDashboardPage } from './admin-dashboard-page';

jest.mock('../api/admin-api');

describe('AdminDashboardPage', () => {
  it('renders chart titles after fetching usage data', async () => {
    jest.spyOn(adminApi, 'getAiUsage').mockResolvedValue({ items: [] });
    jest.spyOn(adminApi, 'getAiUsageTrend').mockResolvedValue({ items: [] });

    render(<AdminDashboardPage />);

    expect(await screen.findByText(/top organizations/i)).toBeInTheDocument();
    expect(await screen.findByText(/xu hướng usage/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/frontend test -- admin-dashboard-page`
Expected: FAIL — page does not exist.

- [ ] **Step 3: Implement `AdminDashboardPage`**

```typescript
// apps/frontend/src/features/admin/pages/admin-dashboard-page.tsx
import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  type AiUsageAggregateItem,
  type AiUsageTrendPoint,
  getAiUsage,
  getAiUsageTrend,
} from '../api/admin-api';

function last7DayRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export function AdminDashboardPage() {
  const [topOrgs, setTopOrgs] = useState<AiUsageAggregateItem[]>([]);
  const [trend, setTrend] = useState<AiUsageTrendPoint[]>([]);

  useEffect(() => {
    const { from, to } = last7DayRange();
    void getAiUsage(from, to).then((result) => setTopOrgs(result.items));
    void getAiUsageTrend(from, to).then((result) => setTrend(result.items));
  }, []);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Top organizations theo usage (7 ngày)</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topOrgs}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="organizationName" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="requestCount" fill="var(--chart-1)" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Xu hướng usage theo ngày (7 ngày)</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="requestCount" stroke="var(--chart-2)" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
```

Check `apps/frontend/src/components/ui/card.tsx` for the exact `Card`/`CardHeader`/`CardTitle`/`CardContent` export names before implementing and adjust if they differ.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/frontend test -- admin-dashboard-page`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/admin/pages/admin-dashboard-page.tsx apps/frontend/src/features/admin/pages/admin-dashboard-page.spec.tsx
git commit -m "feat: add AdminDashboardPage with recharts visualizations"
```

---

## Task 8: Wire the route tree + full verification

**Files:**
- Modify: `apps/frontend/src/routes/index.tsx`
- Modify: `apps/frontend/src/App.tsx` (or wherever `authRoutes`/`appRoutes` are consumed by the router — check first)

**Interfaces:**
- Produces: `adminRoutes: RouteObject[]` exported from `routes/index.tsx`, mounted in the app's router config

- [ ] **Step 1: Add lazy imports and `adminRoutes` to `routes/index.tsx`**

```typescript
// apps/frontend/src/routes/index.tsx
// add alongside the existing lazy imports:
const AdminLoginPage = lazy(() =>
  import('@/features/admin/pages/admin-login-page').then((m) => ({ default: m.AdminLoginPage })),
);
const AdminDashboardPage = lazy(() =>
  import('@/features/admin/pages/admin-dashboard-page').then((m) => ({ default: m.AdminDashboardPage })),
);
const AdminOrganizationsPage = lazy(() =>
  import('@/features/admin/pages/admin-organizations-page').then((m) => ({ default: m.AdminOrganizationsPage })),
);
const AdminAiUsagePage = lazy(() =>
  import('@/features/admin/pages/admin-ai-usage-page').then((m) => ({ default: m.AdminAiUsagePage })),
);

// add near the other imports:
import { AdminLayout } from '@/components/layout/admin-layout';
import { AdminRoute } from './admin-route';

// add a new exported route array — note admin/login is a standalone route
// (no AdminLayout/status rail, no AdminRoute guard — same shape as authRoutes),
// while the other 3 pages nest under AdminLayout, each wrapped in AdminRoute:
export const adminRoutes: RouteObject[] = [
  { path: 'admin/login', element: withPageSuspense(<AdminLoginPage />) },
  {
    path: 'admin',
    element: (
      <AdminRoute>
        <AdminLayout />
      </AdminRoute>
    ),
    children: [
      { path: 'dashboard', element: withPageSuspense(<AdminDashboardPage />) },
      { path: 'organizations', element: withPageSuspense(<AdminOrganizationsPage />) },
      { path: 'ai-usage', element: withPageSuspense(<AdminAiUsagePage />) },
    ],
  },
];
```

- [ ] **Step 2: Mount `adminRoutes` in the router**

Read `apps/frontend/src/App.tsx` (or the file that assembles `authRoutes`/`appRoutes` into the final router) to find the exact `createBrowserRouter`/`<Routes>` structure, then add `...adminRoutes` at the same top level as `authRoutes` — **not** nested inside the customer `<ProtectedRoute>`/`AppLayout` tree, since Operator sessions have no `organizationId`/customer `user` object.

- [ ] **Step 3: Type check and full frontend test suite**

Run: `npx tsc --noEmit && pnpm --filter @casso-ledger/frontend test`
Expected: PASS

- [ ] **Step 4: Manual smoke check**

Per AGENTS.md: "For UI or frontend changes, start the dev server and use the feature in a browser before reporting the task as complete." Run `pnpm dev` (or the frontend-specific dev command), navigate to `/admin/login`, log in with a seeded operator account (`isOperator: true`, from backend plan Task 1's e2e fixture or a manual DB update), and click through all 3 admin pages, confirming the breaker switch visually flips and the status rail updates after a lock/unlock.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/routes/index.tsx apps/frontend/src/App.tsx
git commit -m "feat: wire admin route tree into the app router"
```
