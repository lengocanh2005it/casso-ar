# SMTP Settings UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 4th "Email server riêng" tab to `apps/frontend/src/features/settings/pages/settings-page.tsx`, consuming the already-shipped `GET|POST|DELETE /api/v1/smtp-config` (PR #91). Closes issue #92. No backend changes.

**Architecture:** Follows the exact established `features/settings/` shape (`api/` functions → TanStack Query hooks in `use-settings.ts` → components) and the `ConnectDialog`/`connection-table.tsx` conventions from `features/bank-connections/` for the create-with-external-verification and destructive-confirm patterns respectively. Two new components: `SmtpTab` (status card, 4 states) and `SmtpConfigDialog` (the form). No new shadcn primitive, no new design tokens — see `docs/superpowers/specs/2026-08-11-smtp-settings-ui-design.md` §1.

**Tech Stack:** Existing stack only — TanStack Query, `axios`-backed `apiRequest`/`postWithIdempotency` (`lib/api-client.ts`), Vitest + `@testing-library/react`, `sonner` toasts, shadcn `Card`/`Badge`/`Dialog`/`AlertDialog`/`Input`/`Button`, `InlineFormError` (`components/ui/inline-form-error.tsx`), `hasPermission`/`hasPlanAccess`.

## Global Constraints

- No backend changes — this plan only touches `apps/frontend/`.
- RBAC: configure/edit/delete buttons hidden (not disabled) unless `hasPermission(user?.role ?? null, Permission.ORGANIZATION_SMTP_MANAGE)` — per `.claude/rules/frontend.md`. The status card itself (read view) stays visible to every role, matching `billing-tab.tsx`'s pattern of a read-only-visible tab with role-gated actions.
- Plan gating: `hasPlanAccess(currentPlan, PlanId.BUSINESS)` (existing helper, `lib/plan-access.ts`) — do NOT reuse `UpgradeDialog`/`casso:plan-limit` (spec §5 — different semantics, do not risk the working quantity-limit flow).
- Password field is NEVER prefilled, even in edit mode — the `GET` response has no password field to prefill from (spec §3).
- Submit button copy changes with mutation state: `Lưu cấu hình` (idle) → `Đang kiểm tra kết nối…` (pending, disabled) — not a generic spinner (spec §3, the request can take several seconds).
- `fetchSmtpConfig()` treats `404` as `null`, not an error — catch inside the API function, rethrow everything else (spec §4).
- Money/formatting: N/A, no money fields in this feature.
- No `any` in production code. Types from `@casso-ledger/shared-types` where applicable (`PlanId`, `Permission`, `Role`).
- Naming fixed: `SmtpConfig`, `SmtpConfigInput`, `SmtpTab`, `SmtpConfigDialog`, hooks `useSmtpConfig`/`useSaveSmtpConfig`/`useDeleteSmtpConfig`, API functions `fetchSmtpConfig`/`saveSmtpConfig`/`deleteSmtpConfig`.

---

## File Structure

```
apps/frontend/src/features/settings/
  types.ts                            -- MODIFY: add SmtpConfig, SmtpConfigInput
  api/
    settings-api.ts                   -- MODIFY: add fetchSmtpConfig/saveSmtpConfig/deleteSmtpConfig
    settings-api.spec.ts              -- NEW: 404-as-null behavior (the one real branch of logic in the API layer)
    use-settings.ts                   -- MODIFY: add useSmtpConfig/useSaveSmtpConfig/useDeleteSmtpConfig
  components/
    smtp-config-dialog.tsx            -- NEW
    smtp-config-dialog.spec.ts x      -- NEW (colocated as smtp-config-dialog.spec.tsx)
    smtp-tab.tsx                      -- NEW
    smtp-tab.spec.tsx                 -- NEW
  pages/settings-page.tsx             -- MODIFY: 4th tab trigger + content
```

---

### Task 1: Types + API layer (`fetchSmtpConfig`/`saveSmtpConfig`/`deleteSmtpConfig`)

**Files:**
- Modify: `apps/frontend/src/features/settings/types.ts`
- Modify: `apps/frontend/src/features/settings/api/settings-api.ts`
- Test: `apps/frontend/src/features/settings/api/settings-api.spec.ts`

**Interfaces:**
- Produces: `SmtpConfig { host; port; username; fromAddress; status: 'CONNECTED' | 'FAILED' }`, `SmtpConfigInput { host; port; username; password; fromAddress }`, `fetchSmtpConfig(): Promise<SmtpConfig | null>`, `saveSmtpConfig(input: SmtpConfigInput): Promise<SmtpConfig>`, `deleteSmtpConfig(): Promise<{ success: boolean }>` — consumed by Task 2's hooks

- [ ] **Step 1: Add types to `types.ts`**

```typescript
export type SmtpConfigStatus = 'CONNECTED' | 'FAILED';

export interface SmtpConfig {
  host: string;
  port: number;
  username: string;
  fromAddress: string;
  status: SmtpConfigStatus;
}

export interface SmtpConfigInput {
  host: string;
  port: number;
  username: string;
  password: string;
  fromAddress: string;
}
```

- [ ] **Step 2: Write the failing test for the 404-as-null behavior**

Create `apps/frontend/src/features/settings/api/settings-api.spec.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';

const apiRequest = vi.fn();
vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  postWithIdempotency: vi.fn(),
}));

import { fetchSmtpConfig } from './settings-api';

describe('fetchSmtpConfig', () => {
  it('returns null when the API responds 404 (not configured)', async () => {
    apiRequest.mockRejectedValueOnce({ response: { status: 404 } });

    expect(await fetchSmtpConfig()).toBeNull();
  });

  it('returns the config on success', async () => {
    const config = {
      host: 'smtp.congtyb.vn',
      port: 587,
      username: 'noreply@congtyb.vn',
      fromAddress: 'noreply@congtyb.vn',
      status: 'CONNECTED',
    };
    apiRequest.mockResolvedValueOnce(config);

    expect(await fetchSmtpConfig()).toEqual(config);
  });

  it('rethrows any non-404 error', async () => {
    apiRequest.mockRejectedValueOnce({ response: { status: 500 } });

    await expect(fetchSmtpConfig()).rejects.toBeTruthy();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/frontend test src/features/settings/api/settings-api.spec.ts`
Expected: FAIL — `fetchSmtpConfig` is not exported

- [ ] **Step 4: Add the three functions to `settings-api.ts`**

```typescript
import type { SmtpConfig, SmtpConfigInput } from '../types';
// ...existing imports...

export async function fetchSmtpConfig(): Promise<SmtpConfig | null> {
  try {
    return await apiRequest<SmtpConfig>({ url: '/api/v1/smtp-config', method: 'GET' });
  } catch (error) {
    const status =
      typeof error === 'object' && error !== null && 'response' in error
        ? (error as { response?: { status?: unknown } }).response?.status
        : undefined;
    if (status === 404) return null;
    throw error;
  }
}

export function saveSmtpConfig(input: SmtpConfigInput): Promise<SmtpConfig> {
  return postWithIdempotency<SmtpConfig>('/api/v1/smtp-config', input);
}

export function deleteSmtpConfig(): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>({
    url: '/api/v1/smtp-config',
    method: 'DELETE',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/frontend test src/features/settings/api/settings-api.spec.ts`
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/settings/types.ts apps/frontend/src/features/settings/api/settings-api.ts apps/frontend/src/features/settings/api/settings-api.spec.ts
git commit -m "feat(frontend): add SMTP config API layer (404-as-null GET, save, delete)"
```

---

### Task 2: TanStack Query hooks

**Files:**
- Modify: `apps/frontend/src/features/settings/api/use-settings.ts`

**Interfaces:**
- Consumes: Task 1's API functions
- Produces: `useSmtpConfig()`, `useSaveSmtpConfig()`, `useDeleteSmtpConfig()`, used by Task 3/4's components

Thin hook wrappers around already-tested API functions, following the exact `useEmailTemplates`/`useCreateTemplate`/`useDeleteTemplate` shape in the same file — no new branching logic, so no dedicated spec (consistent with how those existing hooks have no spec of their own; correctness is proven by Task 4's component tests, which exercise these hooks through `SmtpTab`/`SmtpConfigDialog`).

- [ ] **Step 1: Add the hooks**

```typescript
import { deleteSmtpConfig, fetchSmtpConfig, saveSmtpConfig } from './settings-api';
import type { SmtpConfigInput } from '../types';
// ...existing imports...

const smtpConfigKey = ['smtp-config'];

export function useSmtpConfig() {
  return useQuery({ queryKey: smtpConfigKey, queryFn: fetchSmtpConfig });
}

export function useSaveSmtpConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SmtpConfigInput) => saveSmtpConfig(input),
    onSuccess: () => {
      toast.success('Đã lưu cấu hình SMTP.');
      void queryClient.invalidateQueries({ queryKey: smtpConfigKey });
    },
    // No onError toast — the dialog surfaces the SMTP_CONNECTION_FAILED message
    // inline via InlineFormError instead (spec §3); a toast would duplicate it.
  });
}

export function useDeleteSmtpConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteSmtpConfig,
    onSuccess: () => {
      toast.success('Đã xoá cấu hình SMTP.');
      void queryClient.invalidateQueries({ queryKey: smtpConfigKey });
    },
    onError: () => toast.error('Không thể xoá cấu hình SMTP.'),
  });
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm --filter @casso-ledger/frontend type-check`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/features/settings/api/use-settings.ts
git commit -m "feat(frontend): add useSmtpConfig/useSaveSmtpConfig/useDeleteSmtpConfig hooks"
```

---

### Task 3: `SmtpConfigDialog` (the form)

**Files:**
- Create: `apps/frontend/src/features/settings/components/smtp-config-dialog.tsx`
- Test: `apps/frontend/src/features/settings/components/smtp-config-dialog.spec.tsx`

**Interfaces:**
- Consumes: `useSaveSmtpConfig` (Task 2), `InlineFormError` (`@/components/ui/inline-form-error`)
- Produces: `SmtpConfigDialog({ trigger, existingConfig }: { trigger: React.ReactNode; existingConfig: SmtpConfig | null })`, used by `SmtpTab` (Task 4) for both the "Cấu hình SMTP" (no `existingConfig`) and "Sửa cấu hình" (`existingConfig` set) entry points

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/features/settings/components/smtp-config-dialog.spec.tsx`:

```typescript
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SmtpConfigDialog } from './smtp-config-dialog';

const apiRequest = vi.fn();
vi.mock('@/lib/api-client', () => ({
  apiRequest: (...a: unknown[]) => apiRequest(...a),
  postWithIdempotency: (url: string, data: unknown) =>
    apiRequest({ url, method: 'POST', data }),
}));

function renderDialog(existingConfig: Parameters<typeof SmtpConfigDialog>[0]['existingConfig'] = null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <SmtpConfigDialog trigger={<button type="button">Cấu hình SMTP</button>} existingConfig={existingConfig} />
    </QueryClientProvider>,
  );
}

describe('SmtpConfigDialog', () => {
  it('prefills host/username/fromAddress but leaves password blank when editing', () => {
    renderDialog({
      host: 'smtp.congtyb.vn',
      port: 587,
      username: 'noreply@congtyb.vn',
      fromAddress: 'noreply@congtyb.vn',
      status: 'CONNECTED',
    });
    fireEvent.click(screen.getByText('Cấu hình SMTP'));

    expect(screen.getByLabelText(/máy chủ/i)).toHaveValue('smtp.congtyb.vn');
    expect(screen.getByLabelText(/mật khẩu/i)).toHaveValue('');
  });

  it('shows "Đang kiểm tra kết nối…" while the save request is pending', async () => {
    apiRequest.mockImplementation(() => new Promise(() => {})); // never resolves
    renderDialog();
    fireEvent.click(screen.getByText('Cấu hình SMTP'));
    fireEvent.change(screen.getByLabelText(/máy chủ/i), { target: { value: 'smtp.a.vn' } });
    fireEvent.change(screen.getByLabelText(/cổng/i), { target: { value: '587' } });
    fireEvent.change(screen.getByLabelText(/tên đăng nhập/i), { target: { value: 'a@a.vn' } });
    fireEvent.change(screen.getByLabelText(/mật khẩu/i), { target: { value: 'pw' } });
    fireEvent.change(screen.getByLabelText(/gửi từ/i), { target: { value: 'a@a.vn' } });

    fireEvent.click(screen.getByRole('button', { name: /lưu cấu hình/i }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /đang kiểm tra kết nối/i })).toBeDisabled(),
    );
  });

  it('surfaces SMTP_CONNECTION_FAILED inline instead of a toast', async () => {
    apiRequest.mockRejectedValueOnce({
      response: { status: 400, data: { message: 'Không thể kết nối tới smtp.a.vn: auth rejected' } },
    });
    renderDialog();
    fireEvent.click(screen.getByText('Cấu hình SMTP'));
    fireEvent.change(screen.getByLabelText(/máy chủ/i), { target: { value: 'smtp.a.vn' } });
    fireEvent.change(screen.getByLabelText(/cổng/i), { target: { value: '587' } });
    fireEvent.change(screen.getByLabelText(/tên đăng nhập/i), { target: { value: 'a@a.vn' } });
    fireEvent.change(screen.getByLabelText(/mật khẩu/i), { target: { value: 'pw' } });
    fireEvent.change(screen.getByLabelText(/gửi từ/i), { target: { value: 'a@a.vn' } });
    fireEvent.click(screen.getByRole('button', { name: /lưu cấu hình/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/không thể kết nối/i),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/frontend test src/features/settings/components/smtp-config-dialog.spec.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Create `smtp-config-dialog.tsx`**

Fields: `host` (`<Input id="host" />` + `<Label htmlFor="host">Máy chủ (host)</Label>`), `port` (`type="number"`), `username`, `password` (`type="password"`, always starts `''`, helper `<p className="text-xs text-muted-foreground">Luôn phải nhập lại, kể cả khi chỉ sửa các trường khác — Casso không lưu lại mật khẩu cũ để hiển thị.</p>` under the label), `fromAddress` (`type="email"`). `useEffect` on `existingConfig`/dialog-open to reset the form (host/port/username/fromAddress from `existingConfig`, password always `''`). Submit button: `disabled={saveMutation.isPending}`, text `saveMutation.isPending ? 'Đang kiểm tra kết nối…' : 'Lưu cấu hình'`. On `saveMutation.isError`, extract `error.response?.data?.message` and render via `<InlineFormError message={errorMessage} />` above the submit button — reset to `null` on every new submit attempt. On success, close the dialog.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/frontend test src/features/settings/components/smtp-config-dialog.spec.tsx`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/settings/components/smtp-config-dialog.tsx apps/frontend/src/features/settings/components/smtp-config-dialog.spec.tsx
git commit -m "feat(frontend): add SmtpConfigDialog form with inline SMTP_CONNECTION_FAILED error"
```

---

### Task 4: `SmtpTab` (status card, 4 states, delete confirm)

**Files:**
- Create: `apps/frontend/src/features/settings/components/smtp-tab.tsx`
- Test: `apps/frontend/src/features/settings/components/smtp-tab.spec.tsx`

**Interfaces:**
- Consumes: `useSmtpConfig`/`useDeleteSmtpConfig` (Task 2), `SmtpConfigDialog` (Task 3), `hasPermission`/`hasPlanAccess`, `useAuth`
- Produces: `SmtpTab`, mounted by Task 5's `settings-page.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/features/settings/components/smtp-tab.spec.tsx`:

```typescript
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PlanId } from '@casso-ledger/shared-types';
import { describe, expect, it, vi } from 'vitest';
import { SmtpTab } from './smtp-tab';

const apiRequest = vi.fn();
vi.mock('@/lib/api-client', () => ({
  apiRequest: (...a: unknown[]) => apiRequest(...a),
  postWithIdempotency: vi.fn(),
}));
let mockUser = { role: 'OWNER', subscriptionPlan: PlanId.BUSINESS };
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ user: mockUser }) }));

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><SmtpTab /></QueryClientProvider>);
}

describe('SmtpTab', () => {
  it('shows the plan-locked card and does not call the API when below BUSINESS', () => {
    mockUser = { role: 'OWNER', subscriptionPlan: PlanId.STARTER };
    renderTab();
    expect(screen.getByText(/dành cho gói business/i)).toBeTruthy();
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('shows "Chưa cấu hình" and a configure button on 404', async () => {
    mockUser = { role: 'OWNER', subscriptionPlan: PlanId.BUSINESS };
    apiRequest.mockRejectedValueOnce({ response: { status: 404 } });
    renderTab();
    await waitFor(() => expect(screen.getByText(/chưa cấu hình/i)).toBeTruthy());
    expect(screen.getByRole('button', { name: /cấu hình smtp/i })).toBeTruthy();
  });

  it('shows the CONNECTED status with a default-variant badge', async () => {
    apiRequest.mockResolvedValueOnce({
      host: 'smtp.congtyb.vn', port: 587, username: 'a@a.vn', fromAddress: 'a@a.vn', status: 'CONNECTED',
    });
    renderTab();
    await waitFor(() => expect(screen.getByText('Đang hoạt động')).toBeTruthy());
    expect(screen.getByText(/đang gửi từ domain của bạn/i)).toBeTruthy();
  });

  it('shows the FAILED status with the fallback explanation', async () => {
    apiRequest.mockResolvedValueOnce({
      host: 'smtp.congtyb.vn', port: 587, username: 'a@a.vn', fromAddress: 'a@a.vn', status: 'FAILED',
    });
    renderTab();
    await waitFor(() => expect(screen.getByText('Gặp sự cố')).toBeTruthy());
    expect(screen.getByText(/tạm gửi qua casso/i)).toBeTruthy();
  });

  it('requires AlertDialog confirmation before calling delete', async () => {
    apiRequest
      .mockResolvedValueOnce({ host: 'smtp.congtyb.vn', port: 587, username: 'a@a.vn', fromAddress: 'a@a.vn', status: 'CONNECTED' })
      .mockResolvedValueOnce({ success: true });
    renderTab();
    await waitFor(() => screen.getByText('Đang hoạt động'));

    fireEvent.click(screen.getByRole('button', { name: /xoá cấu hình/i }));
    expect(apiRequest).toHaveBeenCalledTimes(1); // only the initial GET — delete not yet confirmed

    fireEvent.click(screen.getByRole('button', { name: /^xoá cấu hình$/i, hidden: true }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));
  });

  it('hides configure/edit/delete buttons without ORGANIZATION_SMTP_MANAGE (non-OWNER)', async () => {
    mockUser = { role: 'VIEWER', subscriptionPlan: PlanId.BUSINESS };
    apiRequest.mockRejectedValueOnce({ response: { status: 404 } });
    renderTab();
    await waitFor(() => expect(screen.getByText(/chưa cấu hình/i)).toBeTruthy());
    expect(screen.queryByRole('button', { name: /cấu hình smtp/i })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/frontend test src/features/settings/components/smtp-tab.spec.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Create `smtp-tab.tsx`**

Structure per spec §2/§3: read `user` via `useAuth()`; `canManage = hasPermission(user?.role ?? null, Permission.ORGANIZATION_SMTP_MANAGE)`; `planOk = hasPlanAccess(user?.subscriptionPlan ?? PlanId.FREE, PlanId.BUSINESS)`. If `!planOk`, render the locked `Card` immediately and return — do NOT call `useSmtpConfig()` in that branch (the first test asserts `apiRequest` is never called), so gate the query itself with `enabled: planOk` inside `useSmtpConfig` at the call site (pass an `enabled` param, mirroring `useEmailTemplates(enabled = true)`'s existing pattern) rather than conditionally calling the hook (hooks can't be called conditionally). Render the not-configured / `CONNECTED` / `FAILED` cards per spec §3's table; wrap the delete button in the `AlertDialog` pattern from `connection-table.tsx`; wrap configure/edit buttons as `SmtpConfigDialog`'s `trigger` prop. Hide (`canManage &&`) all three action buttons but always render the status text/badge.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/frontend test src/features/settings/components/smtp-tab.spec.tsx`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/settings/components/smtp-tab.tsx apps/frontend/src/features/settings/components/smtp-tab.spec.tsx
git commit -m "feat(frontend): add SmtpTab with plan-locked/not-configured/CONNECTED/FAILED states"
```

---

### Task 5: Wire the 4th tab into `settings-page.tsx`

**Files:**
- Modify: `apps/frontend/src/features/settings/pages/settings-page.tsx`
- Modify: `apps/frontend/src/features/settings/index.ts` (barrel — export new types if any consumer outside the feature needs them; likely none)

Config-only (no new branching logic) — no dedicated spec; proven by Task 4's `SmtpTab` tests plus a manual smoke check in Step 3.

- [ ] **Step 1: Add the tab**

```typescript
const TABS = ['billing', 'users', 'templates', 'smtp'] as const;
// ...
<TabsTrigger value="smtp">Email server riêng</TabsTrigger>
// ...
<TabsContent value="smtp" className="pt-4">
  <SmtpTab />
</TabsContent>
```

- [ ] **Step 2: Run frontend test suite + type-check**

Run: `pnpm --filter @casso-ledger/frontend test && pnpm --filter @casso-ledger/frontend type-check`
Expected: all PASS, no errors

- [ ] **Step 3: Manual smoke check**

Run: `pnpm --filter @casso-ledger/frontend dev`, log in as an OWNER on a BUSINESS+-plan seeded org, navigate to `/settings?tab=smtp`. Confirm: locked card renders correctly for a FREE/STARTER test org; configure dialog opens, submits, and (assuming a real or stubbed BE) shows the pending/error/success states; delete requires the `AlertDialog` confirm. Take a screenshot if the environment supports it (per `frontend-design` skill's self-critique guidance) and compare against the ASCII wireframes agreed during the design pass.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/features/settings/pages/settings-page.tsx apps/frontend/src/features/settings/index.ts
git commit -m "feat(frontend): wire SmtpTab into the settings page as a 4th tab"
```

---

## After this plan

- Close issue #92 (`Shipped:` date + PR reference) and update `docs/wayfinder/feature-map.md` per AGENTS.md's ticket workflow.
- The display-name-only sender customization (issue #43's interim-solution comment) remains open and unticketed — out of scope here (spec §0).
