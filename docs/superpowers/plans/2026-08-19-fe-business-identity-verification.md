# FE Business Identity Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the frontend pieces for business identity verification: a `taxCode` field at signup, surfacing the organization's pending-review/rejected state at email verification and login, and an operator review UI for pending organizations.

**Architecture:** No new pages beyond what's strictly needed — `VerifyEmailPage` gains two new states by branching on the verify-email call's `errorCode` (the actual point where the organization's approval status surfaces, since email verification commits before the login/session step that can reject); `LoginPage` gains a toast branch on the same two error codes; `AdminOrganizationsPage` gains a status filter and per-row approve/reject actions, extending its existing table rather than a new page.

**Tech Stack:** React 19, Vite, TypeScript, Tailwind v4, shadcn/ui, TanStack Query, React Router 7, `sonner`, Vitest + Testing Library.

**Spec:** [docs/superpowers/specs/2026-08-19-fe-business-identity-verification-design.md](../specs/2026-08-19-fe-business-identity-verification-design.md) — GitHub issue [#262](https://github.com/lengocanh2005it/casso-ledger/issues/262), backend spec [2026-08-19-business-identity-verification-design.md](../specs/2026-08-19-business-identity-verification-design.md) (#245, already merged to `main`).

## Global Constraints

- No new visual system — every color/spacing/component choice is inherited from the existing design system; only new components are `getApiErrorMessage`, the `taxCode` field, the two new `VerificationState` branches, the login toast branch, and the admin approve/reject UI.
- `taxCode` client-side format check: `^\d{10}(\d{3})?$`.
- `VerifyEmailPage`'s pending-review/rejected states show no form — nothing to resend, the token was already consumed successfully.
- Login toast for `ORGANIZATION_PENDING_REVIEW`/`ORGANIZATION_REJECTED` uses the API's own `message` field, not a hardcoded string — stay on the login page, no navigation.
- `REJECTED` admin rows show a badge only — no resubmit action.
- Follow RED → GREEN → REFACTOR; run the focused Vitest file after each vertical slice.

---

### Task 1: `getApiErrorMessage` helper

**Files:**
- Modify: `apps/frontend/src/lib/api-client.ts`
- Modify: `apps/frontend/src/lib/api-client.spec.ts`

**Interfaces:**
- Produces: `getApiErrorMessage(error: unknown): string | undefined`.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/lib/api-client.spec.ts — add after the existing getApiErrorCode describe block:
describe('getApiErrorMessage', () => {
  it('returns the backend message from an axios-shaped error', () => {
    expect(
      getApiErrorMessage({
        response: { data: { message: 'Tổ chức của bạn đang chờ được duyệt.' } },
      }),
    ).toBe('Tổ chức của bạn đang chờ được duyệt.');
  });

  it('returns undefined for values that are not axios-shaped API errors', () => {
    expect(getApiErrorMessage(new Error('plain error'))).toBeUndefined();
    expect(getApiErrorMessage({ response: { data: {} } })).toBeUndefined();
    expect(getApiErrorMessage(null)).toBeUndefined();
  });
});
```

Add `getApiErrorMessage` to the existing `import { ..., getApiErrorCode, ... } from './api-client';` line at the top of the file.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run api-client.spec.ts`
Expected: FAIL — `getApiErrorMessage` is not exported.

- [ ] **Step 3: Implement**

```typescript
// apps/frontend/src/lib/api-client.ts — directly below the existing getApiErrorCode function:
export function getApiErrorMessage(error: unknown): string | undefined {
  const data = getAxiosErrorResponse(error)?.data;
  return typeof data === 'object' && data !== null && 'message' in data
    ? String((data as { message?: unknown }).message)
    : undefined;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run api-client.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/lib/api-client.ts apps/frontend/src/lib/api-client.spec.ts
git commit -m "feat: add getApiErrorMessage helper"
```

---

### Task 2: Signup form — add the `taxCode` field

**Files:**
- Modify: `apps/frontend/src/features/auth/pages/signup-page.tsx`
- Modify: `apps/frontend/src/features/auth/pages/signup-page.spec.tsx`
- Modify: `apps/frontend/src/features/auth/pages/signup-verify.spec.tsx`

**Interfaces:**
- Produces: the signup POST body now includes `taxCode`.

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/frontend/src/features/auth/pages/signup-page.spec.tsx
// Update fillAndSubmit to also fill taxCode:
function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText(/tên tổ chức/i), {
    target: { value: 'Casso Ledger' },
  });
  fireEvent.change(screen.getByLabelText(/mã số thuế/i), {
    target: { value: '0101234567' },
  });
  fireEvent.change(screen.getByLabelText(/họ và tên/i), {
    target: { value: 'New User' },
  });
  fireEvent.change(screen.getByLabelText(/email/i), {
    target: { value: 'new@casso.vn' },
  });
  fireEvent.change(screen.getByLabelText(/mật khẩu/i), {
    target: { value: 'secret123' },
  });
  fireEvent.click(screen.getByRole('button', { name: /tạo tài khoản/i }));
}

// Add a new test in the describe block:
it('rejects a malformed tax code before submitting', async () => {
  apiRequest.mockResolvedValue({
    userId: 'u1',
    organizationId: 'o1',
    organizationStatus: 'ACTIVE',
  });

  render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/signup']}>
        <Routes>
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/verify-email" element={<div>verify email</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );

  await waitFor(() =>
    expect(screen.getByLabelText(/tên tổ chức/i)).toBeVisible(),
  );
  fireEvent.change(screen.getByLabelText(/tên tổ chức/i), {
    target: { value: 'Casso Ledger' },
  });
  fireEvent.change(screen.getByLabelText(/mã số thuế/i), {
    target: { value: '123' },
  });
  fireEvent.change(screen.getByLabelText(/họ và tên/i), {
    target: { value: 'New User' },
  });
  fireEvent.change(screen.getByLabelText(/email/i), {
    target: { value: 'new@casso.vn' },
  });
  fireEvent.change(screen.getByLabelText(/mật khẩu/i), {
    target: { value: 'secret123' },
  });
  fireEvent.click(screen.getByRole('button', { name: /tạo tài khoản/i }));

  await waitFor(() =>
    expect(screen.getByText(/mã số thuế phải gồm 10 hoặc 13 chữ số/i)).toBeVisible(),
  );
  expect(apiRequest).not.toHaveBeenCalled();
});
```

```typescript
// apps/frontend/src/features/auth/pages/signup-verify.spec.tsx
// Update the first test's field-fill block and its assertion:
    fireEvent.change(screen.getByLabelText(/tên tổ chức/i), {
      target: { value: 'Casso Ledger' },
    });
    fireEvent.change(screen.getByLabelText(/mã số thuế/i), {
      target: { value: '0101234567' },
    });
    fireEvent.change(screen.getByLabelText(/họ và tên/i), {
      target: { value: 'New User' },
    });
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'new@casso.vn' },
    });
    fireEvent.change(screen.getByLabelText(/mật khẩu/i), {
      target: { value: 'secret123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /tạo tài khoản/i }));

    await waitFor(() =>
      expect(screen.getByText(/kiểm tra email/i)).toBeVisible(),
    );
    expect(apiRequest).toHaveBeenNthCalledWith(1, {
      url: '/api/v1/auth/signup',
      method: 'POST',
      data: {
        organizationName: 'Casso Ledger',
        name: 'New User',
        email: 'new@casso.vn',
        password: 'secret123',
        taxCode: '0101234567',
      },
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run signup-page.spec.tsx signup-verify.spec.tsx`
Expected: FAIL — no "Mã số thuế" label exists yet; the body assertion is missing `taxCode`.

- [ ] **Step 3: Add the field and validation**

```typescript
// apps/frontend/src/features/auth/pages/signup-page.tsx
import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { InlineFormError } from '@/components/ui/inline-form-error';
import { Spinner } from '@/components/ui/spinner';
import { apiRequest, authTokenManager } from '@/lib/api-client';
import { AuthLogoLink } from '../components/auth-logo-link';

const TAX_CODE_PATTERN = /^\d{10}(\d{3})?$/;

export function SignupPage() {
  const navigate = useNavigate();
  const [organizationName, setOrganizationName] = useState('');
  const [taxCode, setTaxCode] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!TAX_CODE_PATTERN.test(taxCode.trim())) {
      setError('Mã số thuế phải gồm 10 hoặc 13 chữ số.');
      return;
    }

    setSubmitting(true);
    try {
      authTokenManager.resetLogoutState();
      await apiRequest<{
        userId: string;
        organizationId: string;
        organizationStatus: 'ACTIVE' | 'PENDING_REVIEW';
        accessToken?: string;
      }>({
        url: '/api/v1/auth/signup',
        method: 'POST',
        data: { organizationName, name, email, password, taxCode },
      });
      toast.success('Tạo tài khoản thành công.');
      navigate(`/verify-email?email=${encodeURIComponent(email.trim())}`);
    } catch {
      setError('Không thể tạo tài khoản. Vui lòng kiểm tra thông tin.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 p-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-xl border bg-card p-6 shadow-sm"
      >
        <AuthLogoLink />

        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Tạo tài khoản</h1>
          <p className="text-sm text-muted-foreground">
            Bắt đầu quản lý công nợ cho doanh nghiệp của bạn.
          </p>
        </div>

        <label className="block space-y-1">
          <span className="text-sm font-medium">Tên tổ chức</span>
          <input
            name="organizationName"
            required
            autoComplete="organization"
            placeholder="VD: Công ty TNHH ABC"
            value={organizationName}
            onChange={(event) => setOrganizationName(event.target.value)}
            className="h-10 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">Mã số thuế</span>
          <input
            name="taxCode"
            required
            inputMode="numeric"
            maxLength={13}
            placeholder="VD: 0101234567"
            value={taxCode}
            onChange={(event) => setTaxCode(event.target.value)}
            className="h-10 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">Họ và tên</span>
          <input
            name="name"
            required
            autoComplete="name"
            placeholder="VD: Nguyễn Văn A"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="h-10 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">Email</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            spellCheck={false}
            placeholder="ban@congty.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="h-10 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">Mật khẩu</span>
          <input
            type="password"
            name="password"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="Ít nhất 8 ký tự"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-10 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        <InlineFormError message={error} />

        <Button
          type="submit"
          disabled={submitting}
          aria-busy={submitting}
          className="w-full"
        >
          {submitting && <Spinner />}
          {submitting ? 'Đang xử lý…' : 'Tạo tài khoản'}
        </Button>

        <p className="text-sm">
          Đã có tài khoản?{' '}
          <Link
            to="/login"
            className="text-primary pointer-hover:hover:underline"
          >
            Đăng nhập
          </Link>
        </p>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run signup-page.spec.tsx signup-verify.spec.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/auth/pages/signup-page.tsx apps/frontend/src/features/auth/pages/signup-page.spec.tsx apps/frontend/src/features/auth/pages/signup-verify.spec.tsx
git commit -m "feat: require a tax code at signup"
```

---

### Task 3: Verify-email page — pending-review and rejected states

**Files:**
- Modify: `apps/frontend/src/features/auth/pages/verify-email-page.tsx`
- Modify: `apps/frontend/src/features/auth/pages/signup-verify.spec.tsx`

**Interfaces:**
- Consumes: `getApiErrorCode`, `getApiErrorMessage` (Task 1).
- Produces: `VerificationState` gains `'pending-review' | 'rejected'`.

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/frontend/src/features/auth/pages/signup-verify.spec.tsx
// The vi.mock('@/lib/api-client', ...) block at the top must also export
// getApiErrorCode/getApiErrorMessage matching their real (pure) behavior,
// since VerifyEmailPage will import them:
vi.mock('@/lib/api-client', () => ({
  authTokenManager: {
    getValidAccessToken,
    hasKnownSession: () => true,
    setAccessToken: vi.fn(),
    resetLogoutState: vi.fn(),
    markLogoutInitiated: vi.fn(),
    clearStaleRefreshSession: vi.fn(),
  },
  apiRequest,
  getApiErrorCode: (error: unknown) =>
    (error as { response?: { data?: { errorCode?: string } } })?.response
      ?.data?.errorCode,
  getApiErrorMessage: (error: unknown) =>
    (error as { response?: { data?: { message?: string } } })?.response?.data
      ?.message,
}));

// Add two new tests in the describe block:
it('shows a pending-review state when the organization is awaiting approval', async () => {
  apiRequest.mockRejectedValueOnce({
    response: {
      data: {
        errorCode: 'ORGANIZATION_PENDING_REVIEW',
        message: 'Tổ chức của bạn đang chờ được duyệt.',
      },
    },
  });

  render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/verify-email?token=verify-token']}>
        <Routes>
          <Route path="/verify-email" element={<VerifyEmailPage />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );

  await waitFor(() =>
    expect(screen.getByText(/email đã được xác minh/i)).toBeVisible(),
  );
  expect(
    screen.getByText(/tổ chức của bạn đang chờ được duyệt/i),
  ).toBeVisible();
});

it('shows a rejected state with the API message when the organization was rejected', async () => {
  apiRequest.mockRejectedValueOnce({
    response: {
      data: {
        errorCode: 'ORGANIZATION_REJECTED',
        message: 'Đăng ký tổ chức của bạn chưa được chấp thuận.',
      },
    },
  });

  render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/verify-email?token=verify-token']}>
        <Routes>
          <Route path="/verify-email" element={<VerifyEmailPage />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );

  await waitFor(() =>
    expect(
      screen.getByText(/đăng ký tổ chức của bạn chưa được chấp thuận/i),
    ).toBeVisible(),
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run signup-verify.spec.tsx`
Expected: FAIL — no such states/copy exist yet.

- [ ] **Step 3: Implement the two new states**

```typescript
// apps/frontend/src/features/auth/pages/verify-email-page.tsx
import { type FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { InlineFormError } from '@/components/ui/inline-form-error';
import { Spinner } from '@/components/ui/spinner';
import { useAuth } from '@/contexts/auth-context';
import {
  apiRequest,
  authTokenManager,
  getApiErrorCode,
  getApiErrorMessage,
} from '@/lib/api-client';
import { AuthLogoLink } from '../components/auth-logo-link';

type VerificationState =
  | 'pending'
  | 'verifying'
  | 'error'
  | 'pending-review'
  | 'rejected';

const DEFAULT_REJECTED_MESSAGE =
  'Đăng ký tổ chức của bạn chưa được chấp thuận.';

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const token = searchParams.get('token');
  const [email, setEmail] = useState(searchParams.get('email') ?? '');
  const [resending, setResending] = useState(false);
  const [resendSent, setResendSent] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const [rejectedMessage, setRejectedMessage] = useState(
    DEFAULT_REJECTED_MESSAGE,
  );
  const [state, setState] = useState<VerificationState>(
    token ? 'verifying' : 'pending',
  );

  async function onResend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResending(true);
    setResendSent(false);
    setResendError(null);

    try {
      await apiRequest({
        url: '/api/v1/auth/resend-verification',
        method: 'POST',
        data: { email },
      });
      setResendSent(true);
    } catch {
      setResendError('Không thể gửi lại email. Vui lòng thử lại sau.');
    } finally {
      setResending(false);
    }
  }

  useEffect(() => {
    if (!token) {
      setState('pending');
      return;
    }

    let cancelled = false;
    void apiRequest<{ accessToken: string }>({
      url: '/api/v1/auth/verify-email',
      method: 'POST',
      data: { token },
    })
      .then(async (result) => {
        authTokenManager.setAccessToken(result.accessToken);
        await refreshUser();
        if (!cancelled) navigate('/onboarding', { replace: true });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const errorCode = getApiErrorCode(error);
        if (errorCode === 'ORGANIZATION_PENDING_REVIEW') {
          setState('pending-review');
          return;
        }
        if (errorCode === 'ORGANIZATION_REJECTED') {
          setRejectedMessage(getApiErrorMessage(error) ?? DEFAULT_REJECTED_MESSAGE);
          setState('rejected');
          return;
        }
        setState('error');
      });

    return () => {
      cancelled = true;
    };
  }, [navigate, refreshUser, token]);

  if (state === 'pending') {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 text-center">
        <AuthLogoLink />
        <div role="status" className="space-y-2">
          <h1 className="text-xl font-semibold">Kiểm tra email</h1>
          <p className="text-sm text-muted-foreground">
            Mở liên kết trong email để xác minh tài khoản và tiếp tục thiết lập.
          </p>
          <form onSubmit={onResend} className="space-y-2 text-left">
            <label className="block space-y-1">
              <span className="text-sm font-medium">Email</span>
              <input
                type="email"
                name="email"
                required
                autoComplete="email"
                spellCheck={false}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-10 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <InlineFormError message={resendError} />
            {resendSent && (
              <p className="text-sm text-muted-foreground" role="status">
                Đã gửi lại email xác thực. Hãy kiểm tra hộp thư của bạn.
              </p>
            )}
            <Button
              type="submit"
              disabled={resending}
              aria-busy={resending}
              className="w-full"
            >
              {resending && <Spinner />}
              {resending ? 'Đang gửi…' : 'Gửi lại email xác thực'}
            </Button>
          </form>
          <Link
            to="/login"
            className="text-primary pointer-hover:hover:underline"
          >
            Quay lại đăng nhập
          </Link>
        </div>
      </div>
    );
  }

  if (state === 'verifying') {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 text-center">
        <AuthLogoLink />
        <div role="status">Đang xác minh email…</div>
      </div>
    );
  }

  if (state === 'pending-review') {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 text-center">
        <AuthLogoLink />
        <div role="status" className="space-y-2">
          <h1 className="text-xl font-semibold">Email đã được xác minh</h1>
          <p className="text-sm text-muted-foreground">
            Tổ chức của bạn đang chờ được duyệt — chúng tôi sẽ gửi email khi
            có kết quả.
          </p>
          <Link
            to="/login"
            className="text-primary pointer-hover:hover:underline"
          >
            Đến trang đăng nhập
          </Link>
        </div>
      </div>
    );
  }

  if (state === 'rejected') {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 text-center">
        <AuthLogoLink />
        <div role="alert" className="space-y-2">
          <h1 className="text-xl font-semibold">Đăng ký chưa được chấp thuận</h1>
          <p className="text-sm text-muted-foreground">{rejectedMessage}</p>
          <Link
            to="/login"
            className="text-primary pointer-hover:hover:underline"
          >
            Đến trang đăng nhập
          </Link>
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 text-center">
        <AuthLogoLink />
        <div role="status" className="space-y-2">
          <h1 className="text-xl font-semibold">Liên kết không hợp lệ</h1>
          <p className="text-sm text-muted-foreground">
            Liên kết xác minh đã hết hạn hoặc không tồn tại.
          </p>
          <Link
            to="/login"
            className="text-primary pointer-hover:hover:underline"
          >
            Đến trang đăng nhập
          </Link>
        </div>
      </div>
    );
  }

  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run signup-verify.spec.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/auth/pages/verify-email-page.tsx apps/frontend/src/features/auth/pages/signup-verify.spec.tsx
git commit -m "feat: show pending-review/rejected states after email verification"
```

---

### Task 4: Login page — toast for organization status errors

**Files:**
- Modify: `apps/frontend/src/features/auth/pages/login-page.tsx`
- Modify: `apps/frontend/src/features/auth/pages/login-page.spec.tsx`

**Interfaces:**
- Consumes: `getApiErrorCode`, `getApiErrorMessage` (Task 1).

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/features/auth/pages/login-page.spec.tsx
// Update the vi.mock to also export getApiErrorCode/getApiErrorMessage
// (see Task 3 Step 1 for the exact shape), and mock 'sonner' so the toast
// call is observable:
const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: toastError } }));

vi.mock('@/lib/api-client', () => ({
  authTokenManager: {
    getValidAccessToken,
    hasKnownSession: () => true,
    setAccessToken: vi.fn(),
    resetLogoutState: vi.fn(),
    markLogoutInitiated: vi.fn(),
    clearStaleRefreshSession: vi.fn(),
  },
  apiRequest,
  getApiErrorCode: (error: unknown) =>
    (error as { response?: { data?: { errorCode?: string } } })?.response
      ?.data?.errorCode,
  getApiErrorMessage: (error: unknown) =>
    (error as { response?: { data?: { message?: string } } })?.response?.data
      ?.message,
}));

// Add to the describe block, and reset toastError in beforeEach:
it('toasts and stays on the page when the organization is pending review', async () => {
  apiRequest.mockRejectedValue({
    response: {
      data: {
        errorCode: 'ORGANIZATION_PENDING_REVIEW',
        message: 'Tổ chức của bạn đang chờ được duyệt.',
      },
    },
  });

  render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={<div>dashboard</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );

  await waitFor(() => expect(screen.getByLabelText(/email/i)).toBeVisible());
  fillAndSubmit();

  await waitFor(() =>
    expect(toastError).toHaveBeenCalledWith('Tổ chức của bạn đang chờ được duyệt.'),
  );
  expect(screen.queryByText('dashboard')).not.toBeInTheDocument();
  expect(
    screen.queryByText(/email hoặc mật khẩu không đúng/i),
  ).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run login-page.spec.tsx`
Expected: FAIL — `toastError` never called; the page falls back to `InlineFormError`.

- [ ] **Step 3: Implement**

```typescript
// apps/frontend/src/features/auth/pages/login-page.tsx
import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { InlineFormError } from '@/components/ui/inline-form-error';
import { Spinner } from '@/components/ui/spinner';
import { useAuth } from '@/contexts/auth-context';
import { getApiErrorCode, getApiErrorMessage } from '@/lib/api-client';
import { AuthLogoLink } from '../components/auth-logo-link';

const ORGANIZATION_STATUS_ERROR_CODES = new Set([
  'ORGANIZATION_PENDING_REVIEW',
  'ORGANIZATION_REJECTED',
]);

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await login(email, password);
      toast.success('Đăng nhập thành công.');
      navigate('/dashboard');
    } catch (submitError) {
      const errorCode = getApiErrorCode(submitError);
      if (errorCode && ORGANIZATION_STATUS_ERROR_CODES.has(errorCode)) {
        toast.error(
          getApiErrorMessage(submitError) ??
            'Tổ chức của bạn hiện không thể sử dụng dịch vụ.',
        );
      } else {
        setError('Email hoặc mật khẩu không đúng.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 p-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-xl border bg-card p-6 shadow-sm"
      >
        <AuthLogoLink />

        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Đăng nhập</h1>
          <p className="text-sm text-muted-foreground">
            Quản lý công nợ và dòng tiền của doanh nghiệp.
          </p>
        </div>

        <label className="block space-y-1">
          <span className="text-sm font-medium">Email</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            spellCheck={false}
            placeholder="ban@congty.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="h-10 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">Mật khẩu</span>
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
            placeholder="Nhập mật khẩu"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-10 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        <InlineFormError message={error} />

        <Button
          type="submit"
          disabled={submitting}
          aria-busy={submitting}
          className="w-full"
        >
          {submitting && <Spinner />}
          {submitting ? 'Đang xử lý…' : 'Đăng nhập'}
        </Button>

        <div className="flex justify-between text-sm">
          <Link
            to="/signup"
            className="text-primary pointer-hover:hover:underline"
          >
            Tạo tài khoản
          </Link>
          <Link
            to="/forgot-password"
            className="text-primary pointer-hover:hover:underline"
          >
            Quên mật khẩu?
          </Link>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run login-page.spec.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/auth/pages/login-page.tsx apps/frontend/src/features/auth/pages/login-page.spec.tsx
git commit -m "feat: toast organization status errors on login instead of blaming credentials"
```

---

### Task 5: Admin API layer — status filter, approve, reject

**Files:**
- Modify: `apps/frontend/src/features/admin/api/admin-api.ts`
- Modify: `apps/frontend/src/features/admin/api/admin-api.spec.ts`
- Modify: `apps/frontend/src/features/admin/api/use-admin.ts`

**Interfaces:**
- Produces: `OrganizationListItem` gains `taxCode: string`, `taxCodeMatched: boolean`, `taxCodeLookupName: string | null`, and `status: 'ACTIVE' | 'LOCKED' | 'PENDING_REVIEW' | 'REJECTED'`.
- Produces: `AdminOrganizationStatusFilter` type (`'ALL' | 'ACTIVE' | 'LOCKED' | 'PENDING_REVIEW' | 'REJECTED'`), `listOrganizations(page, limit, status)`, `approveOrganization(id)`, `rejectOrganization(id, reason)`.
- Produces: `useAdminOrganizations(page, limit, status)`, `useApproveOrganization()`, `useRejectOrganization()`.

- [ ] **Step 1: Write the failing tests**

This spec file mocks `@/lib/api-client` directly (a plain `vi.fn()` named `apiRequest`, reset in each suite's own `beforeEach`) — mirror the existing `describe('admin pending invite API', ...)` block's shape with a new sibling block. Update the file's import line to also pull in `approveOrganization`, `listOrganizations`, `rejectOrganization`:

```typescript
// apps/frontend/src/features/admin/api/admin-api.spec.ts
// Update the existing import at the top of the file:
import {
  approveOrganization,
  listOrganizations,
  rejectOrganization,
  resendOrganizationInvite,
  revokeOrganizationInvite,
} from './admin-api';

// Add a new describe block after the existing 'admin pending invite API' one:
describe('admin organization status API', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    apiRequest.mockResolvedValue(undefined);
  });

  it('lists organizations filtered by status', async () => {
    apiRequest.mockResolvedValue({ items: [], total: 0, page: 1, limit: 50 });

    await listOrganizations(1, 50, 'PENDING_REVIEW');

    expect(apiRequest).toHaveBeenCalledWith({
      url: '/api/v1/admin/organizations',
      method: 'GET',
      params: { page: 1, limit: 50, status: 'PENDING_REVIEW' },
    });
  });

  it('approves an organization', async () => {
    apiRequest.mockResolvedValue({ status: 'ACTIVE' });

    await approveOrganization('org-1');

    expect(apiRequest).toHaveBeenCalledWith({
      url: '/api/v1/admin/organizations/org-1/approve',
      method: 'POST',
    });
  });

  it('rejects an organization with a reason', async () => {
    apiRequest.mockResolvedValue({ status: 'REJECTED' });

    await rejectOrganization('org-1', 'MST không khớp');

    expect(apiRequest).toHaveBeenCalledWith({
      url: '/api/v1/admin/organizations/org-1/reject',
      method: 'POST',
      data: { reason: 'MST không khớp' },
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run admin-api.spec.ts`
Expected: FAIL — `approveOrganization`/`rejectOrganization` don't exist; `listOrganizations` doesn't accept a third argument yet, and the existing call sites don't pass `status`.

- [ ] **Step 3: Implement**

```typescript
// apps/frontend/src/features/admin/api/admin-api.ts
// Replace the OrganizationListItem interface and listOrganizations function,
// and add two new functions after unlockOrganization:

export type AdminOrganizationStatusFilter =
  | 'ALL'
  | 'ACTIVE'
  | 'LOCKED'
  | 'PENDING_REVIEW'
  | 'REJECTED';

export interface OrganizationListItem {
  id: string;
  name: string;
  status: 'ACTIVE' | 'LOCKED' | 'PENDING_REVIEW' | 'REJECTED';
  taxCode: string;
  taxCodeMatched: boolean;
  taxCodeLookupName: string | null;
  createdAt: string;
}

export function listOrganizations(
  page: number,
  limit: number,
  status: AdminOrganizationStatusFilter = 'ALL',
): Promise<{
  items: OrganizationListItem[];
  total: number;
  page: number;
  limit: number;
}> {
  return apiRequest({
    url: '/api/v1/admin/organizations',
    method: 'GET',
    params: { page, limit, status },
  });
}

// ...(getAdminOrganization, listOrganizationMembers, invites, block/unblock,
// lockOrganization, unlockOrganization stay unchanged)...

export function approveOrganization(id: string): Promise<{ status: string }> {
  return apiRequest({
    url: `/api/v1/admin/organizations/${id}/approve`,
    method: 'POST',
  });
}

export function rejectOrganization(
  id: string,
  reason: string,
): Promise<{ status: string }> {
  return apiRequest({
    url: `/api/v1/admin/organizations/${id}/reject`,
    method: 'POST',
    data: { reason },
  });
}
```

Note: `listOrganizations(page, limit)` two-argument call sites (e.g. `useAdminOrganizationStatus` below) keep compiling unchanged since `status` defaults to `'ALL'` — which the backend's `AdminOrganizationsQueryDto` already treats as "no filter" (see #245 Task 10).

```typescript
// apps/frontend/src/features/admin/api/use-admin.ts
// Update useAdminOrganizations to accept status, and add two new mutation hooks:
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  type AdminMemberStatusFilter,
  type AdminOrganizationStatusFilter,
  approveOrganization,
  blockOrganizationMember,
  getAdminOrganization,
  getAiUsage,
  getAiUsageTrend,
  listOrganizationMembers,
  listOrganizations,
  lockOrganization,
  rejectOrganization,
  resendOrganizationInvite,
  revokeOrganizationInvite,
  unblockOrganizationMember,
  unlockOrganization,
} from './admin-api';

const adminOrganizationsQueryKey = ['admin-organizations'] as const;
const adminOrganizationMembersQueryKey = [
  'admin-organization',
  'members',
] as const;

export function useAdminOrganizations(
  page: number,
  limit: number,
  status: AdminOrganizationStatusFilter = 'ALL',
) {
  return useQuery({
    queryKey: [...adminOrganizationsQueryKey, page, limit, status],
    queryFn: () => listOrganizations(page, limit, status),
  });
}

export function useAdminOrganizationStatus() {
  return useAdminOrganizations(1, 100);
}

// ...(useAdminAiUsage, useAdminAiUsageTrend, useToggleOrganization,
// useAdminOrganization, useOrganizationMembers, useBlockOrganizationMember,
// useResendOrganizationInvite, useRevokeOrganizationInvite stay unchanged)...

export function useApproveOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => approveOrganization(id),
    onSuccess: () => {
      toast.success('Đã duyệt tổ chức.');
      void queryClient.invalidateQueries({
        queryKey: adminOrganizationsQueryKey,
      });
    },
    onError: () => toast.error('Không thể duyệt tổ chức. Vui lòng thử lại.'),
  });
}

export function useRejectOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      rejectOrganization(id, reason),
    onSuccess: () => {
      toast.success('Đã từ chối tổ chức.');
      void queryClient.invalidateQueries({
        queryKey: adminOrganizationsQueryKey,
      });
    },
    onError: () => toast.error('Không thể từ chối tổ chức. Vui lòng thử lại.'),
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run admin-api.spec.ts`
Expected: PASS

- [ ] **Step 5: Run the frontend type-check**

Run: `npx tsc --noEmit --project apps/frontend`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/admin/api/admin-api.ts apps/frontend/src/features/admin/api/admin-api.spec.ts apps/frontend/src/features/admin/api/use-admin.ts
git commit -m "feat: add organization status filter, approve, and reject to the admin API layer"
```

---

### Task 6: Admin Organizations page — status filter and approve/reject actions

**Files:**
- Modify: `apps/frontend/src/features/admin/pages/admin-organizations-page.tsx`
- Modify: `apps/frontend/src/features/admin/pages/admin-organizations-page.spec.tsx`

**Interfaces:**
- Consumes: `useAdminOrganizations` (with status), `useApproveOrganization`, `useRejectOrganization` (Task 5).

- [ ] **Step 1: Write the failing tests**

This file mocks the whole API module with `vi.mock('../api/admin-api')` (auto-mock — every export becomes a `vi.fn()`, read via `vi.mocked(adminApi.x)`), so `approveOrganization`/`rejectOrganization` are already mockable with no extra setup. Two existing assertions call `listOrganizations` with only `(page, limit)`; `useAdminOrganizations` now always passes a third `status` argument (defaulting to `'ALL'`), so update those two call sites too:

```typescript
// apps/frontend/src/features/admin/pages/admin-organizations-page.spec.tsx
// Line 46 — update the existing assertion:
    expect(adminApi.listOrganizations).toHaveBeenCalledWith(1, 50, 'ALL');

// Line 162 — update the existing assertion:
    await waitFor(() =>
      expect(adminApi.listOrganizations).toHaveBeenLastCalledWith(2, 50, 'ALL'),
    );

// Add two new tests at the end of the describe block:
it('shows the tax-code match and approve/reject actions for a pending-review organization', async () => {
  vi.mocked(adminApi.listOrganizations).mockResolvedValue({
    items: [
      {
        id: 'org-1',
        name: 'Acme',
        status: 'PENDING_REVIEW',
        taxCode: '0101234567',
        taxCodeMatched: false,
        taxCodeLookupName: 'ACME KHAC',
        createdAt: '2026-08-01T00:00:00.000Z',
      },
    ],
    total: 1,
    page: 1,
    limit: 100,
  });

  renderPage();

  expect(await screen.findByText('Acme')).toBeInTheDocument();
  expect(screen.getByText('0101234567')).toBeInTheDocument();
  expect(screen.getByText('ACME KHAC')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Duyệt' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Từ chối' })).toBeInTheDocument();
});

it('rejects a pending organization with a required reason', async () => {
  vi.mocked(adminApi.listOrganizations).mockResolvedValue({
    items: [
      {
        id: 'org-1',
        name: 'Acme',
        status: 'PENDING_REVIEW',
        taxCode: '0101234567',
        taxCodeMatched: false,
        taxCodeLookupName: 'ACME KHAC',
        createdAt: '2026-08-01T00:00:00.000Z',
      },
    ],
    total: 1,
    page: 1,
    limit: 100,
  });
  vi.mocked(adminApi.rejectOrganization).mockResolvedValue({
    status: 'REJECTED',
  });

  renderPage();

  expect(await screen.findByText('Acme')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Từ chối' }));

  const submitButton = await screen.findByRole('button', {
    name: 'Xác nhận từ chối',
  });
  expect(submitButton).toBeDisabled();

  fireEvent.change(screen.getByLabelText(/lý do từ chối/i), {
    target: { value: 'MST không khớp' },
  });
  expect(submitButton).toBeEnabled();

  fireEvent.click(submitButton);

  await waitFor(() =>
    expect(adminApi.rejectOrganization).toHaveBeenCalledWith(
      'org-1',
      'MST không khớp',
    ),
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run admin-organizations-page.spec.tsx`
Expected: FAIL — no status filter, no approve/reject UI exists yet; the two updated `listOrganizations` assertions fail against the still-two-argument call.

- [ ] **Step 3: Implement**

```typescript
// apps/frontend/src/features/admin/pages/admin-organizations-page.tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useUrlQueryParams } from '@/lib/use-url-query-params';
import type {
  AdminOrganizationStatusFilter,
  OrganizationListItem,
} from '../api/admin-api';
import {
  useAdminOrganizations,
  useApproveOrganization,
  useRejectOrganization,
  useToggleOrganization,
} from '../api/use-admin';
import { BreakerSwitch } from '../components/breaker-switch';

const ORGANIZATION_PAGE_SIZE = 50;
const dateFormatter = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'medium',
});

const STATUS_OPTIONS: { value: AdminOrganizationStatusFilter; label: string }[] =
  [
    { value: 'ALL', label: 'Tất cả' },
    { value: 'ACTIVE', label: 'Đang hoạt động' },
    { value: 'LOCKED', label: 'Đã khóa' },
    { value: 'PENDING_REVIEW', label: 'Chờ duyệt' },
    { value: 'REJECTED', label: 'Đã từ chối' },
  ];

function normalizeStatus(value: string | null): AdminOrganizationStatusFilter {
  const known = STATUS_OPTIONS.find((option) => option.value === value);
  return known ? known.value : 'ALL';
}

function RejectDialog({ organizationId }: { organizationId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const rejectOrganization = useRejectOrganization();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Từ chối
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Từ chối tổ chức</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Label className="block space-y-1">
            <span className="text-sm">Lý do từ chối</span>
            <Textarea
              name="reason"
              required
              placeholder="Nhập lý do từ chối…"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </Label>
          <Button
            disabled={!reason.trim() || rejectOrganization.isPending}
            onClick={() =>
              rejectOrganization.mutate(
                { id: organizationId, reason: reason.trim() },
                { onSuccess: () => setOpen(false) },
              )
            }
          >
            Xác nhận từ chối
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AdminOrganizationsPage() {
  const { searchParams, setPage, patch } = useUrlQueryParams();
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
  const status = normalizeStatus(searchParams.get('status'));
  const organizationsQuery = useAdminOrganizations(
    page,
    ORGANIZATION_PAGE_SIZE,
    status,
  );
  const toggleOrganization = useToggleOrganization();
  const approveOrganization = useApproveOrganization();
  const items = organizationsQuery.data?.items ?? [];
  const total = organizationsQuery.data?.total ?? 0;
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  function setStatusFilter(nextStatus: AdminOrganizationStatusFilter) {
    patch((next) => {
      next.set('status', nextStatus);
      next.delete('page');
    });
  }

  async function handleToggle(org: OrganizationListItem) {
    setPendingId(org.id);
    setActionError(null);
    try {
      await toggleOrganization.mutateAsync({
        id: org.id,
        action: org.status === 'ACTIVE' ? 'lock' : 'unlock',
      });
    } catch {
      setActionError(
        'Không thể cập nhật trạng thái tổ chức. Vui lòng thử lại.',
      );
    } finally {
      setPendingId(null);
    }
  }

  if (organizationsQuery.isPending) {
    return (
      <p role="status" aria-live="polite">
        Đang tải tổ chức…
      </p>
    );
  }

  if (organizationsQuery.isError) {
    return (
      <div className="flex items-center gap-3">
        <p role="alert" aria-live="polite" className="text-sm text-destructive">
          Không thể tải danh sách tổ chức. Vui lòng thử lại.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void organizationsQuery.refetch()}
        >
          Thử lại
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-primary">ADMIN CONSOLE</p>
        <h1 className="mt-1 text-balance text-2xl font-semibold tracking-tight">
          Organizations
        </h1>
      </div>

      <Select value={status} onValueChange={setStatusFilter}>
        <SelectTrigger className="w-56">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Chưa có tổ chức nào.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tên tổ chức</TableHead>
              <TableHead className="font-mono">ID</TableHead>
              <TableHead>Mã số thuế</TableHead>
              <TableHead>Ngày tạo</TableHead>
              <TableHead>Trạng thái</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((org) => {
              const displayName = org.name || 'tổ chức này';
              const isLocking = org.status === 'ACTIVE';
              const isPendingReview = org.status === 'PENDING_REVIEW';

              return (
                <TableRow key={org.id}>
                  <TableCell>
                    <span
                      className="block max-w-[18rem] truncate"
                      title={org.name}
                    >
                      {org.name || 'Không có tên tổ chức'}
                    </span>
                    <Link
                      to={`/admin/organizations/${org.id}/members`}
                      className="rounded-md text-sm font-medium text-primary pointer-hover:hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Thành viên
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    <span
                      className="block max-w-[14rem] truncate"
                      title={org.id}
                      translate="no"
                    >
                      {org.id}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">
                    <span>{org.taxCode || '—'}</span>
                    {org.taxCode && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Badge variant={org.taxCodeMatched ? 'default' : 'destructive'}>
                          {org.taxCodeMatched ? 'Khớp' : 'Không khớp'}
                        </Badge>
                        {org.taxCodeLookupName && (
                          <span title={org.taxCodeLookupName}>
                            {org.taxCodeLookupName}
                          </span>
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {dateFormatter.format(new Date(org.createdAt))}
                  </TableCell>
                  <TableCell>
                    {org.status === 'ACTIVE' || org.status === 'LOCKED' ? (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <BreakerSwitch
                            checked={!isLocking}
                            disabled={pendingId === org.id}
                            onCheckedChange={() => undefined}
                            label={
                              isLocking
                                ? `Lock ${displayName}`
                                : `Unlock ${displayName}`
                            }
                          />
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              {isLocking
                                ? `Khóa ${displayName}?`
                                : `Mở khóa ${displayName}?`}
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              {isLocking
                                ? 'Tổ chức sẽ không thể truy cập hệ thống cho đến khi được mở khóa.'
                                : 'Tổ chức sẽ có thể truy cập hệ thống trở lại.'}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Hủy</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => void handleToggle(org)}
                            >
                              {isLocking ? 'Xác nhận khóa' : 'Xác nhận mở khóa'}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    ) : isPendingReview ? (
                      <div className="flex gap-2">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm">Duyệt</Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                Duyệt {displayName}?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                Tổ chức sẽ có thể truy cập hệ thống ngay sau khi
                                duyệt.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Hủy</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() =>
                                  approveOrganization.mutate(org.id)
                                }
                              >
                                Xác nhận duyệt
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                        <RejectDialog organizationId={org.id} />
                      </div>
                    ) : (
                      <Badge variant="destructive">Đã từ chối</Badge>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      {total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>
            Trang {page} /{' '}
            {Math.max(1, Math.ceil(total / ORGANIZATION_PAGE_SIZE))}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Trước
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= Math.ceil(total / ORGANIZATION_PAGE_SIZE)}
              onClick={() => setPage(page + 1)}
            >
              Sau
            </Button>
          </div>
        </div>
      )}
      {actionError && (
        <p role="alert" aria-live="polite" className="text-sm text-destructive">
          {actionError}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run admin-organizations-page.spec.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/admin/pages/admin-organizations-page.tsx apps/frontend/src/features/admin/pages/admin-organizations-page.spec.tsx
git commit -m "feat: add status filter and approve/reject actions to the admin organizations page"
```

---

### Task 7: Verify, review, and finalize

- [ ] Run the full frontend test suite: `pnpm --filter @casso-ledger/frontend test`
- [ ] Run the frontend type-check: `npx tsc --noEmit --project apps/frontend`
- [ ] Run lint/format: `npx biome check --write .`
- [ ] Run `pnpm verify`
- [ ] Manually smoke-test in a browser (per CLAUDE.md's UI-change rule): signup with a tax code, verify email for both an auto-approved and a pending-review account (can be forced via backend test data/mocked VietQR response), log in against a pending-review organization and confirm the toast, and exercise the admin approve/reject flow.
- [ ] Run `/code-review` against `main`; fix any actionable Standards or Spec findings
- [ ] Inspect `git diff`/`git status`, then commit any leftover formatting fixes
- [ ] Update `docs/wayfinder/feature-map.md`: mark issue #262's entry `in-progress` → `done` once the PR is up, with the `Shipped:` date and PR reference
