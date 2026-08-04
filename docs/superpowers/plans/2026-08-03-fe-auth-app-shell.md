# FE Auth & App Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the authentication UI and session layer for `apps/frontend` on top of the scaffold from `2026-08-03-frontend-design-system.md`: upgrade the API client to the `AuthTokenManager` pattern (auto-refresh JWT, single-flight), add `useAuth` + route guards, and implement all 6 auth pages (login, signup, verify-email, forgot/reset password, invite accept) wired to the backend endpoints from `2026-08-03-authentication-onboarding.md`.

**Architecture:** Client pattern auth tự refresh JWT qua httpOnly cookie: axios instance + `AuthTokenManager` (single-flight), route guards `ProtectedRoute`/`GuestRoute`, auth context (`contexts/`). Casso's BE returns plain JSON (no `ApiResponse` wrapper), so the client unwraps with `response.data`. Session restore on page reload: `getValidAccessToken()` (triggers refresh via httpOnly cookie if needed) → `GET /api/v1/me` → set user.

**Tech Stack:** axios (new dependency — the design-system plan's `lib/api-client.ts` is a fetch wrapper; replace with axios to support interceptors/auto token refresh), TanStack Query (already installed), React Router 7 (already installed), vitest + testing-library (already installed, `src/test/setup.ts` exists).

## Global Constraints

- Root scripts: `pnpm --filter @casso-ledger/frontend test` (vitest), `pnpm --filter @casso-ledger/frontend type-check` (tsc -b --noEmit), lint/format via Biome root.
- TypeScript strict mode is on (scaffolding spec mục 4).
- BE response shape: **plain JSON, no `ApiResponse` wrapper** (verified: no `ApiResponse` exists in any BE plan). Client uses `response.data` directly.
- Refresh-token contract: `POST /api/v1/auth/refresh` exchanges the httpOnly cookie for a new `{ accessToken }` — FE always sends `withCredentials: true`; the BE authentication plan owns this cookie contract.
- `GET /api/v1/me` returns `{ id, email, name, role, organizationId, organizationName, subscriptionPlan }` per the Read APIs completion plan — the FE's `AuthenticatedUser`.
- `POST /api/v1/auth/signup` returns `{ accessToken, userId, organizationId }`; FE stores the token and hydrates the session with `GET /api/v1/me` (authentication plan Task 5: `SignupUseCase` calls `LoginUseCase` internally).
- No form library (no react-hook-form/zod): controlled components + HTML5 validation only.
- Copy pattern, not re-implementation; adapt shapes to Casso. All concrete values are in the steps below — do NOT re-scan external sources.
- Naming: file kebab-case, component PascalCase (scaffolding spec mục 4).

---

## File Structure

```
apps/frontend/src/
  lib/api-client.ts                    -- REPLACE fetch wrapper with axios instance + AuthTokenManager
  lib/rbac.ts                          -- CREATE: hasPermission(role, permission), permission constants
  lib/format.ts                        -- CREATE: formatVND, formatDate
  contexts/auth-context.tsx            -- CREATE: AuthProvider + useAuth (session state, login/logout)
  routes/protected-route.tsx           -- CREATE: ProtectedRoute, GuestRoute
  routes/index.tsx                     -- MODIFY: add auth routes, wrap app in guard
  features/auth/login-page.tsx         -- CREATE
  features/auth/signup-page.tsx        -- CREATE
  features/auth/verify-email-page.tsx  -- CREATE
  features/auth/forgot-password-page.tsx  -- CREATE
  features/auth/reset-password-page.tsx   -- CREATE
  features/auth/invite-accept-page.tsx    -- CREATE
  components/layout/sidebar-footer.tsx -- CREATE: avatar + name + email + logout (if the design-system plan already rendered a static footer, replace its content with this)
  test/auth-flow.spec.tsx              -- CREATE: login/signup component tests
  test/api-client.spec.ts              -- CREATE: AuthTokenManager unit tests
```

---

### Task 1: Upgrade `lib/api-client.ts` to axios + AuthTokenManager

**Files:**
- Modify: `apps/frontend/src/lib/api-client.ts` (full replace)
- Test: `apps/frontend/test/api-client.spec.ts`

**Interfaces:**
- Consumes: nothing (replaces the fetch wrapper from the design-system plan Task 5)
- Produces:
  - `apiClient` — axios instance, origin baseURL from `VITE_API_BASE_URL ?? 'http://localhost:3000'`, `withCredentials: true`; every request URL includes the canonical `/api/v1` prefix exactly once
  - `authTokenManager` — `setAccessToken(token: string | null)`, `getValidAccessToken(): Promise<string | null>` (auto-refresh, single-flight), `markLogoutInitiated()`, `resetLogoutState()`, `clearStaleRefreshSession()`
  - `apiRequest<T>(config: AxiosRequestConfig): Promise<T>` — unwraps `response.data`, attaches the valid token **when one exists** (public routes like verify-email/invite/reset must work without login), rethrows axios errors (401/403/402/5xx). Public routes call it exactly like authenticated ones.
  - Used by every later task and all future FE plans.

- [ ] **Step 1: Install axios**

Run: `pnpm --filter @casso-ledger/frontend add axios` and `pnpm dlx shadcn@latest add skeleton` (Skeleton is needed by the route guards in Task 4; the design-system plan did not create it)

- [ ] **Step 2: Write the failing test**

Create `apps/frontend/test/api-client.spec.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';

const postMock = vi.fn();
vi.mock('axios', () => ({
  default: { create: () => ({ post: (...args: unknown[]) => postMock(...args) }), post: postMock },
}));

import { AuthTokenManager } from '@/lib/api-client';

describe('AuthTokenManager', () => {
  let manager: AuthTokenManager;
  beforeEach(() => {
    manager = new AuthTokenManager();
    postMock.mockReset();
  });
  afterEach(() => vi.clearAllMocks());

  it('returns the token without refreshing when still valid', async () => {
    const future = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 300 }));
    manager.setAccessToken(`h.${future}.s`);
    const token = await manager.getValidAccessToken();
    expect(token).toBe(`h.${future}.s`);
    expect(postMock).not.toHaveBeenCalled();
  });

  it('refreshes when token is missing', async () => {
    postMock.mockResolvedValue({ data: { accessToken: 'new-token' } });
    const token = await manager.getValidAccessToken();
    expect(postMock).toHaveBeenCalledWith('/api/v1/auth/refresh', {}, { withCredentials: true });
    expect(token).toBe('new-token');
  });

  it('only performs one refresh for concurrent callers', async () => {
    let resolve!: (v: unknown) => void;
    postMock.mockImplementation(() => new Promise((r) => (resolve = r)));
    const p1 = manager.getValidAccessToken();
    const p2 = manager.getValidAccessToken();
    resolve({ data: { accessToken: 't' } });
    await Promise.all([p1, p2]);
    expect(postMock).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/frontend test test/api-client.spec.ts`
Expected: FAIL — `Cannot find module '@/lib/api-client'`

- [ ] **Step 4: Implement `AuthTokenManager` + `apiClient`**

Replace the entire content of `apps/frontend/src/lib/api-client.ts`:

```typescript
import axios, { type AxiosRequestConfig } from 'axios';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

export const apiClient = axios.create({ baseURL: API_BASE_URL, withCredentials: true });

export class AuthTokenManager {
  private accessToken: string | null = null;
  private refreshPromise: Promise<string | null> | null = null;
  private logoutInitiated = false;

  setAccessToken(token: string | null) {
    this.accessToken = token;
  }

  getAccessToken() {
    return this.accessToken;
  }

  /** Lấy access token hợp lệ — tự refresh nếu thiếu hoặc gần hết hạn. Single-flight: nhiều caller chung 1 refresh. */
  async getValidAccessToken(): Promise<string | null> {
    if (this.accessToken) {
      try {
        const payload = JSON.parse(atob(this.accessToken.split('.')[1]));
        const expiresSec = payload.exp as number;
        if (expiresSec && expiresSec * 1000 > Date.now() + 30_000) return this.accessToken;
      } catch {
        // Không parse được → refresh
      }
    }
    if (!this.refreshPromise) {
      this.refreshPromise = this.refreshAccessToken()
        .catch(() => null)
        .finally(() => {
          this.refreshPromise = null;
        });
    }
    return this.refreshPromise;
  }

  private async refreshAccessToken(): Promise<string | null> {
    const response = await apiClient.post<{ accessToken: string }>('/api/v1/auth/refresh', {});
    this.accessToken = response.data.accessToken;
    return this.accessToken;
  }

  markLogoutInitiated() {
    this.logoutInitiated = true;
  }

  resetLogoutState() {
    this.logoutInitiated = false;
  }

  async clearStaleRefreshSession() {
    if (this.logoutInitiated) {
      this.accessToken = null;
      return;
    }
    this.logoutInitiated = true;
    this.accessToken = null;
    try {
      await apiClient.post('/api/v1/auth/logout');
    } catch {
      // Cookie may already be invalid — ignore.
    }
  }
}

export const authTokenManager = new AuthTokenManager();

/** Gọi API: gắn token nếu có (route public như verify-email/reset/invite chạy không cần login), unwrap response.data, lỗi HTTP (401/402/403/5xx) throw lên caller. */
export async function apiRequest<T>(config: AxiosRequestConfig): Promise<T> {
  const token = await authTokenManager.getValidAccessToken();
  const response = await apiClient.request<T>({
    ...config,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...config.headers },
  });
  return response.data;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/frontend test test/api-client.spec.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Verify type-check**

Run: `pnpm --filter @casso-ledger/frontend type-check`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/package.json apps/frontend/src/lib/api-client.ts apps/frontend/test/api-client.spec.ts
git commit -m "feat(frontend): axios api client with AuthTokenManager auto-refresh"
```

---

### Task 2: `lib/rbac.ts` + `lib/format.ts`

**Files:**
- Create: `apps/frontend/src/lib/rbac.ts`
- Create: `apps/frontend/src/lib/format.ts`
- Test: `apps/frontend/test/rbac.spec.ts`

**Interfaces:**
- Consumes: `Permission`, `Role` enums from `@casso-ledger/shared-types` (created in scaffolding plan Task 3; `ROLE_PERMISSIONS` map follows the multi-tenancy spec mục 2 — values copied from `2026-08-03-multi-tenancy-rbac-design.md`)
- Produces: `hasPermission(role: Role | string | null, permission: Permission): boolean`, `formatVND(amount: number): string`, `formatDate(iso: string): string` — used by every business page in FE plans 2 and 3.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/test/rbac.spec.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { Permission, Role } from '@casso-ledger/shared-types';
import { hasPermission } from '@/lib/rbac';

describe('hasPermission', () => {
  it('OWNER can write off receivables', () => {
    expect(hasPermission(Role.OWNER, Permission.RECEIVABLE_WRITE_OFF)).toBe(true);
  });
  it('VIEWER cannot write off', () => {
    expect(hasPermission(Role.VIEWER, Permission.RECEIVABLE_WRITE_OFF)).toBe(false);
  });
  it('null role is never granted', () => {
    expect(hasPermission(null, Permission.RECEIVABLE_READ)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/frontend test test/rbac.spec.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create `apps/frontend/src/lib/rbac.ts`**

```typescript
import { Permission, Role, ROLE_PERMISSIONS } from '@casso-ledger/shared-types';

export function hasPermission(role: Role | string | null, permission: Permission): boolean {
  if (!role) return false;
  return (ROLE_PERMISSIONS[role as Role] ?? []).includes(permission);
}
```

> If `ROLE_PERMISSIONS` is not yet exported from `packages/shared-types` (scaffolding plan Task 3 only ships `receivable-status.ts`), add it there in this same task: export the `Role`/`Permission` enums and the `Record<Role, Permission[]>` map with the exact values from `2026-08-03-multi-tenancy-rbac-design.md` mục 2. Single source of truth — BE guards and FE buttons share it.

- [ ] **Step 4: Create `apps/frontend/src/lib/format.ts`**

```typescript
/** Định dạng VNĐ: Integer đồng → "50.000.000 ₫". */
export function formatVND(amount: number): string {
  return `${amount.toLocaleString('vi-VN')} ₫`;
}

/** ISO string → "20/08/2026" (giờ địa phương). */
export function formatDate(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleDateString('vi-VN');
}
```

- [ ] **Step 5: Run test + type-check**

Run: `pnpm --filter @casso-ledger/frontend test test/rbac.spec.ts && pnpm --filter @casso-ledger/frontend type-check`
Expected: PASS, no errors

- [ ] **Step 6: Commit**

```bash
git add packages/shared-types apps/frontend/src/lib/rbac.ts apps/frontend/src/lib/format.ts apps/frontend/test/rbac.spec.ts
git commit -m "feat(frontend): rbac helper + VND/date formatters"
```

---

### Task 3: AuthProvider + `useAuth` (session restore via `GET /api/v1/me`)

**Files:**
- Create: `apps/frontend/src/contexts/auth-context.tsx`
- Test: `apps/frontend/test/auth-context.spec.tsx`

**Interfaces:**
- Consumes: `authTokenManager`, `apiRequest` (Task 1), `AuthenticatedUser` type (define locally in this task: `{ id, email, name, role, organizationId, organizationName }`)
- Produces:
  - `<AuthProvider>` — must wrap `<App>` inside `main.tsx` (step 5)
  - `useAuth(): { user, isLoading, isAuthenticated, login(email, password), logout(), refreshUser() }`
  - Used by ProtectedRoute (Task 8), sidebar footer (Task 8), every page in FE plans 2 and 3.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/test/auth-context.spec.tsx`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '@/contexts/auth-context';

const getValidAccessToken = vi.fn();
const apiRequest = vi.fn();
vi.mock('@/lib/api-client', () => ({
  authTokenManager: { getValidAccessToken: (...a: unknown[]) => getValidAccessToken(...a), setAccessToken: vi.fn() },
  apiRequest: (...a: unknown[]) => apiRequest(...a),
}));

function Probe() {
  const { user, isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <div>loading</div>;
  return <div>{isAuthenticated ? `hello ${user?.name}` : 'anonymous'}</div>;
}

describe('AuthProvider', () => {
  it('restores session from /api/v1/me when a valid token exists', async () => {
    getValidAccessToken.mockResolvedValue('tok');
    apiRequest.mockResolvedValue({ id: 'u1', email: 'a@b.c', name: 'An', role: 'OWNER', organizationId: 'o1', organizationName: 'Casso', subscriptionPlan: 'FREE' });
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByText('hello An')).toBeTruthy());
  });

  it('stays anonymous without a token', async () => {
    getValidAccessToken.mockResolvedValue(null);
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByText('anonymous')).toBeTruthy());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/frontend test test/auth-context.spec.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Create `apps/frontend/src/contexts/auth-context.tsx`**

```typescript
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { apiRequest, authTokenManager } from '@/lib/api-client';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId: string;
  organizationName: string;
  subscriptionPlan: 'FREE' | 'STARTER' | 'BUSINESS' | 'ENTERPRISE';
}

interface AuthContextValue {
  user: AuthenticatedUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  refreshUser: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await authTokenManager.getValidAccessToken();
      if (!token) {
        if (!cancelled) setIsLoading(false);
        return;
      }
      try {
        const me = await apiRequest<AuthenticatedUser>({ url: '/api/v1/me', method: 'GET' });
        if (!cancelled) {
          setUser(me);
          setIsLoading(false);
        }
      } catch {
        // Token hết hạn/hủy → coi như anonymous
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshUser = async () => {
    const me = await apiRequest<AuthenticatedUser>({ url: '/api/v1/me', method: 'GET' });
    if (!me) throw new Error('ME_FAILED');
    setUser(me);
  };

  const login = async (email: string, password: string) => {
    // apiRequest throw khi sai email/password (401) — lỗi lan lên LoginPage.onSubmit
    const res = await apiRequest<{ accessToken: string }>({
      url: '/api/v1/auth/login',
      method: 'POST',
      data: { email, password },
    });
    authTokenManager.setAccessToken(res.accessToken);
    await refreshUser();
  };

  const logout = async () => {
    authTokenManager.markLogoutInitiated();
    await authTokenManager.clearStaleRefreshSession();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated: user !== null, refreshUser, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/frontend test test/auth-context.spec.tsx`
Expected: PASS

- [ ] **Step 5: Wrap `<App>` in `<AuthProvider>` in `main.tsx`**

Modify `apps/frontend/src/main.tsx` — import `AuthProvider` and wrap the `<App />` element.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/contexts/auth-context.tsx apps/frontend/src/main.tsx apps/frontend/test/auth-context.spec.tsx
git commit -m "feat(frontend): AuthProvider with /api/v1/me session restore"
```

---

### Task 4: Login page + GuestRoute

**Files:**
- Create: `apps/frontend/src/features/auth/login-page.tsx`
- Create: `apps/frontend/src/routes/protected-route.tsx`
- Test: `apps/frontend/test/auth-flow.spec.tsx`

**Interfaces:**
- Consumes: `useAuth().login` (Task 3)
- Produces: `<LoginPage>` at route `/login`, `<GuestRoute>` (redirects authenticated users to `/dashboard`) — both used in `routes/index.tsx` (Task 8).

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/test/auth-flow.spec.tsx`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/contexts/auth-context';
import { GuestRoute } from '@/routes/protected-route';
import { LoginPage } from '@/features/auth/login-page';

const getValidAccessToken = vi.fn().mockResolvedValue(null);
const apiRequest = vi.fn();
vi.mock('@/lib/api-client', () => ({
  authTokenManager: { getValidAccessToken: (...a: unknown[]) => getValidAccessToken(...a), setAccessToken: vi.fn(), markLogoutInitiated: vi.fn(), resetLogoutState: vi.fn(), clearStaleRefreshSession: vi.fn() },
  apiRequest: (...a: unknown[]) => apiRequest(...a),
}));

describe('LoginPage', () => {
  it('logs in and redirects to /dashboard', async () => {
    apiRequest
      .mockResolvedValueOnce({ accessToken: 'tok' })
      .mockResolvedValueOnce({ id: 'u1', email: 'a@b.c', name: 'An', role: 'OWNER', organizationId: 'o1', organizationName: 'Casso', subscriptionPlan: 'FREE' });
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
            <Route path="/dashboard" element={<div>dashboard</div>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.c' } });
    fireEvent.change(screen.getByLabelText(/mật khẩu/i), { target: { value: 'secret123' } });
    fireEvent.click(screen.getByRole('button', { name: /đăng nhập/i }));
    await waitFor(() => expect(screen.getByText('dashboard')).toBeTruthy());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/frontend test test/auth-flow.spec.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Create `apps/frontend/src/routes/protected-route.tsx`**

```typescript
import { Navigate, useLocation } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/auth-context';

function AuthLoading() {
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-md space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-full" />
      </div>
    </div>
  );
}

/** Đã đăng nhập — dùng chung cho mọi route nghiệp vụ. */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isAuthenticated } = useAuth();
  const location = useLocation();
  if (isLoading) return <AuthLoading />;
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}

/** Chưa đăng nhập — dùng cho /login và các trang auth; đã đăng nhập thì đẩy về /dashboard. */
export function GuestRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <AuthLoading />;
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return children;
}
```

- [ ] **Step 4: Create `apps/frontend/src/features/auth/login-page.tsx`**

```typescript
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await login(email, password);
      toast.success('Đăng nhập thành công');
      navigate('/dashboard');
    } catch {
      toast.error('Email hoặc mật khẩu không đúng');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-semibold">Đăng nhập Casso Ledger</h1>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border px-3 py-2"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Mật khẩu</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border px-3 py-2"
          />
        </label>
        <button type="submit" disabled={submitting} className="w-full rounded-md bg-primary px-4 py-2 text-primary-foreground">
          {submitting ? 'Đang xử lý…' : 'Đăng nhập'}
        </button>
        <div className="flex justify-between text-sm">
          <Link to="/signup" className="text-primary">Tạo tài khoản</Link>
          <Link to="/forgot-password" className="text-primary">Quên mật khẩu?</Link>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/frontend test test/auth-flow.spec.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/routes/protected-route.tsx apps/frontend/src/features/auth/login-page.tsx apps/frontend/test/auth-flow.spec.tsx
git commit -m "feat(frontend): login page with guest redirect guard"
```

---

### Task 5: Signup + verify-email pages

**Files:**
- Create: `apps/frontend/src/features/auth/signup-page.tsx`
- Create: `apps/frontend/src/features/auth/verify-email-page.tsx`
- Modify: `apps/frontend/src/routes/index.tsx` (register routes — full wiring in Task 8, but add the routes now so pages are reachable)

**Interfaces:**
- Consumes: `apiRequest` (Task 1) — `POST /api/v1/auth/signup` body `{ organizationName, name, email, password }` returns `{ accessToken, userId, organizationId }`; after storing the token, call `GET /api/v1/me` to hydrate the session. `GET /api/v1/auth/verify-email?token=<token>` returns 200 with no body on success.
- Produces: `<SignupPage>` at `/signup`, `<VerifyEmailPage>` at `/verify-email`.

- [ ] **Step 1: Create `apps/frontend/src/features/auth/signup-page.tsx`**

```typescript
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { apiRequest, authTokenManager } from '@/lib/api-client';
import { useAuth } from '@/contexts/auth-context';

export function SignupPage() {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const [organizationName, setOrganizationName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await apiRequest<{ accessToken: string }>({
        url: '/api/v1/auth/signup',
        method: 'POST',
        data: { organizationName, name, email, password },
      });
      authTokenManager.setAccessToken(res.accessToken);
      await refreshUser();
      toast.success('Tạo tài khoản thành công');
      navigate('/dashboard');
    } catch {
      toast.error('Đăng ký thất bại — kiểm tra lại thông tin');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-semibold">Tạo tài khoản</h1>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Tên tổ chức</span>
          <input required value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} className="w-full rounded-md border px-3 py-2" />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Tên của bạn</span>
          <input required value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-md border px-3 py-2" />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Email</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-md border px-3 py-2" />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Mật khẩu</span>
          <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-md border px-3 py-2" />
        </label>
        <button type="submit" disabled={submitting} className="w-full rounded-md bg-primary px-4 py-2 text-primary-foreground">
          {submitting ? 'Đang xử lý…' : 'Tạo tài khoản'}
        </button>
        <p className="text-sm">
          Đã có tài khoản? <Link to="/login" className="text-primary">Đăng nhập</Link>
        </p>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Create `apps/frontend/src/features/auth/verify-email-page.tsx`**

```typescript
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiRequest } from '@/lib/api-client';

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const [state, setState] = useState<'verifying' | 'ok' | 'error'>('verifying');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setState('error');
      return;
    }
    apiRequest({ url: '/api/v1/auth/verify-email', method: 'GET', params: { token } })
      .then(() => setState('ok'))
      .catch(() => setState('error'));
  }, [searchParams]);

  if (state === 'verifying') return <div className="p-6 text-center">Đang xác thực email…</div>;
  if (state === 'error') return <div className="p-6 text-center">Link xác thực không hợp lệ hoặc đã hết hạn.</div>;
  return (
    <div className="p-6 text-center">
      <p className="mb-2">Email đã được xác thực.</p>
      <Link to="/login" className="text-primary">Về trang đăng nhập</Link>
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `pnpm --filter @casso-ledger/frontend type-check`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/features/auth/signup-page.tsx apps/frontend/src/features/auth/verify-email-page.tsx
git commit -m "feat(frontend): signup + verify-email pages"
```

---

### Task 6: Forgot + reset password pages

**Files:**
- Create: `apps/frontend/src/features/auth/forgot-password-page.tsx`
- Create: `apps/frontend/src/features/auth/reset-password-page.tsx`

**Interfaces:**
- Consumes: `apiRequest` — `POST /api/v1/auth/forgot-password` body `{ email }` **always returns 200** (spec mục 5, anti-enumeration — UI shows the same success message regardless); `POST /api/v1/auth/reset-password` body `{ token, newPassword }`.

- [ ] **Step 1: Create `apps/frontend/src/features/auth/forgot-password-page.tsx`**

```typescript
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { apiRequest } from '@/lib/api-client';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      // BE luôn trả 200 bất kể email tồn tại (anti-enumeration) — FE hiện thông báo chung
      await apiRequest({ url: '/api/v1/auth/forgot-password', method: 'POST', data: { email } });
      setSent(true);
    } catch {
      toast.error('Có lỗi xảy ra — thử lại sau');
    }
  }

  if (sent) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6 text-center">
        <div>
          <p className="mb-2">Nếu email tồn tại, bạn sẽ nhận được link đặt lại mật khẩu.</p>
          <Link to="/login" className="text-primary">Về trang đăng nhập</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-semibold">Quên mật khẩu</h1>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Email</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-md border px-3 py-2" />
        </label>
        <button type="submit" className="w-full rounded-md bg-primary px-4 py-2 text-primary-foreground">
          Gửi link đặt lại
        </button>
        <p className="text-sm">
          <Link to="/login" className="text-primary">← Quay lại đăng nhập</Link>
        </p>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Create `apps/frontend/src/features/auth/reset-password-page.tsx`**

```typescript
import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { apiRequest } from '@/lib/api-client';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const token = searchParams.get('token');
    if (!token) {
      toast.error('Link đặt lại không hợp lệ');
      return;
    }
    try {
      await apiRequest({ url: '/api/v1/auth/reset-password', method: 'POST', data: { token, newPassword: password } });
      toast.success('Đặt lại mật khẩu thành công');
      setDone(true);
    } catch {
      toast.error('Link hết hạn hoặc không hợp lệ');
    }
  }

  if (done) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6 text-center">
        <div>
          <p className="mb-2">Mật khẩu đã được đặt lại.</p>
          <Link to="/login" className="text-primary">Về trang đăng nhập</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-semibold">Đặt lại mật khẩu</h1>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Mật khẩu mới</span>
          <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-md border px-3 py-2" />
        </label>
        <button type="submit" className="w-full rounded-md bg-primary px-4 py-2 text-primary-foreground">
          Đặt lại mật khẩu
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `pnpm --filter @casso-ledger/frontend type-check`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/features/auth/forgot-password-page.tsx apps/frontend/src/features/auth/reset-password-page.tsx
git commit -m "feat(frontend): forgot + reset password pages"
```

---

### Task 7: Invite accept page

**Files:**
- Create: `apps/frontend/src/features/auth/invite-accept-page.tsx`

**Interfaces:**
- Consumes: `apiRequest` — `POST /api/v1/invites/accept` body `{ token, name, password }` (anonymous; the BE's `OptionalJwtAuthGuard` allows it without a session — authentication plan Task 8). Returns 200 on success.

- [ ] **Step 1: Create `apps/frontend/src/features/auth/invite-accept-page.tsx`**

```typescript
import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { apiRequest } from '@/lib/api-client';

export function InviteAcceptPage() {
  const [searchParams] = useSearchParams();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const token = searchParams.get('token');
    if (!token) {
      toast.error('Link mời không hợp lệ');
      return;
    }
    try {
      await apiRequest({ url: '/api/v1/invites/accept', method: 'POST', data: { token, name, password } });
      toast.success('Đã tham gia tổ chức');
      setDone(true);
    } catch {
      toast.error('Link mời không hợp lệ hoặc đã hết hạn');
    }
  }

  if (done) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6 text-center">
        <div>
          <p className="mb-2">Bạn đã tham gia tổ chức thành công.</p>
          <Link to="/login" className="text-primary">Về trang đăng nhập</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-semibold">Chấp nhận lời mời</h1>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Tên của bạn</span>
          <input required value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-md border px-3 py-2" />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Mật khẩu</span>
          <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-md border px-3 py-2" />
        </label>
        <button type="submit" className="w-full rounded-md bg-primary px-4 py-2 text-primary-foreground">
          Tham gia
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm --filter @casso-ledger/frontend type-check`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/features/auth/invite-accept-page.tsx
git commit -m "feat(frontend): invite accept page"
```

---

### Task 8: Route wiring + sidebar footer (logout)

**Files:**
- Modify: `apps/frontend/src/routes/index.tsx` (full replace — wire all 6 auth routes + guard every business route with `ProtectedRoute`)
- Create: `apps/frontend/src/components/layout/sidebar-footer.tsx`
- Modify: `apps/frontend/src/components/layout/app-layout.tsx` (render `SidebarFooter` inside the sidebar; if the design-system plan already rendered a static footer, replace its content)
- Modify: `apps/frontend/src/App.tsx` (mount `AuthProvider` if not done in Task 3 step 5; render `AppLayout`)

**Interfaces:**
- Consumes: `GuestRoute`/`ProtectedRoute` (Task 4), `useAuth().logout` (Task 3), placeholder pages from the design-system plan (`@/features/<name>/<name>-page`).
- Produces: complete route table — `/login`, `/signup`, `/verify-email`, `/forgot-password`, `/reset-password`, `/invite-accept` (all `GuestRoute`), plus the 10 business routes (all `ProtectedRoute`).

- [ ] **Step 1: Replace `apps/frontend/src/routes/index.tsx`**

```tsx
import { Route, Routes } from 'react-router-dom';
import { GuestRoute, ProtectedRoute } from '@/routes/protected-route';
import { AppLayout } from '@/components/layout/app-layout';
import { LoginPage } from '@/features/auth/login-page';
import { SignupPage } from '@/features/auth/signup-page';
import { VerifyEmailPage } from '@/features/auth/verify-email-page';
import { ForgotPasswordPage } from '@/features/auth/forgot-password-page';
import { ResetPasswordPage } from '@/features/auth/reset-password-page';
import { InviteAcceptPage } from '@/features/auth/invite-accept-page';
import { DashboardPage } from '@/features/dashboard/dashboard-page';
import { CustomersPage } from '@/features/customers/customers-page';
import { ReceivablesPage } from '@/features/receivables/receivables-page';
import { BankConnectionsPage } from '@/features/bank-connections/bank-connections-page';
import { TransactionsPage } from '@/features/transactions/transactions-page';
import { ExceptionsPage } from '@/features/exceptions/exceptions-page';
import { RemindersPage } from '@/features/reminders/reminders-page';
import { CopilotPage } from '@/features/copilot/copilot-page';
import { ReportsPage } from '@/features/reports/reports-page';
import { SettingsPage } from '@/features/settings/settings-page';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
      <Route path="/signup" element={<GuestRoute><SignupPage /></GuestRoute>} />
      <Route path="/verify-email" element={<GuestRoute><VerifyEmailPage /></GuestRoute>} />
      <Route path="/forgot-password" element={<GuestRoute><ForgotPasswordPage /></GuestRoute>} />
      <Route path="/reset-password" element={<GuestRoute><ResetPasswordPage /></GuestRoute>} />
      <Route path="/invite-accept" element={<GuestRoute><InviteAcceptPage /></GuestRoute>} />
      <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="receivables" element={<ReceivablesPage />} />
        <Route path="bank-connections" element={<BankConnectionsPage />} />
        <Route path="transactions" element={<TransactionsPage />} />
        <Route path="exceptions" element={<ExceptionsPage />} />
        <Route path="reminders" element={<RemindersPage />} />
        <Route path="copilot" element={<CopilotPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
```

- [ ] **Step 2: Create `apps/frontend/src/components/layout/sidebar-footer.tsx`**

```tsx
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';

export function SidebarFooter() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function onLogout() {
    await logout();
    toast.success('Đã đăng xuất');
    navigate('/login');
  }

  return (
    <div className="flex items-center gap-3 border-t p-4">
      <div className="flex-1 min-w-0">
        <p className="truncate text-sm font-medium">{user?.name}</p>
        <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
      </div>
      <button onClick={onLogout} className="text-sm text-muted-foreground hover:text-foreground">
        Đăng xuất
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Wire `SidebarFooter` into `app-layout.tsx`**

Modify `apps/frontend/src/components/layout/app-layout.tsx` — import and render `<SidebarFooter />` at the bottom of the sidebar (desktop) and inside the mobile drawer's content. **Check the main content area renders `<Outlet />`** (React Router nested routes from Task 8 Step 1 render into it); if the design-system plan's `AppLayout` renders `children` instead, switch it to `<Outlet />` from `react-router-dom`. Keep the rest of the layout untouched.

- [ ] **Step 4: Update the smoke test**

Modify the design-system plan's smoke test (Task 6) so it renders `<AuthProvider><AppRoutes /></AuthProvider>` wrapped in `MemoryRouter` with an initial route of `/dashboard`, and mocks `@/lib/api-client` (token null → anonymous → redirect to `/login`). Assert the login heading renders instead of the sidebar. Run: `pnpm --filter @casso-ledger/frontend test`
Expected: PASS

- [ ] **Step 5: Run all tests + type-check**

Run: `pnpm --filter @casso-ledger/frontend test && pnpm --filter @casso-ledger/frontend type-check && pnpm --filter @casso-ledger/frontend lint`
Expected: all PASS, no errors

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/routes apps/frontend/src/components/layout apps/frontend/src/App.tsx apps/frontend/test
git commit -m "feat(frontend): auth routes + sidebar logout footer"
```

---

## Self-Review Notes

- **Spec coverage (authentication-onboarding plan):** signup → Task 5; verify-email → Task 5; login/refresh/logout → Tasks 1, 3, 4 (refresh via `AuthTokenManager`, logout via sidebar footer); member invite acceptance → Task 7; admin send-invite UI → FE plan 3 Settings > Users; forgot/reset → Task 6. `GET /api/v1/me` session restore → Task 3. Route guards → Task 4/8.
- **Placeholder scan:** no TBD/TODO; every task has concrete code + test command.
- **Type consistency:** `AuthenticatedUser` defined once in `auth-context.tsx` and used by `login()` and `Probe` test; `AuthTokenManager` methods match Task 1's test exactly (`getValidAccessToken`, `setAccessToken`, `markLogoutInitiated`, `clearStaleRefreshSession`).
- **Resolved contracts:** refresh-token transport is an httpOnly cookie; signup/login return an access token and set the refresh cookie; FE hydrates the user via `/api/v1/me`, which includes `subscriptionPlan` from the Read APIs plan. All FE API calls use the `/api/v1` prefix exactly once. If verification policy changes later, only the signup auto-login flow needs revisiting.
- **Owned by FE plan 3:** plan-gated nav badge (`/copilot`), billing 402 upgrade prompt.
