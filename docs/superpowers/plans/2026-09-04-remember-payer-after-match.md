# Remember Payer Bank Account After Confirmed Match — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a user confirms a bank-transaction match in the Exception Queue, let them opt in (one checkbox) to saving the transaction's payer account for the matched customer, by calling the existing `POST /api/v1/customers/:customerId/bank-accounts` endpoint after the match succeeds.

**Architecture:** Frontend-only change to one component (`SplitMatchDialog`) plus one backend e2e. No backend production code — the create endpoint, use case, DTO, `customer_bank_accounts` schema/index, matching-engine fan-out+scoring, RBAC, and the `payer` read view were all built in #382 and are reused unchanged. Once an active `customer_bank_accounts` link exists, #382's matching engine already narrows and up-scores future webhooks toward that customer (that is AC#5, already delivered).

**Tech Stack:** React 19 + Vite + TypeScript, Vitest + Testing Library, TanStack Query, shadcn/ui (`Checkbox`), `sonner` toasts. Backend e2e: Jest + `@nestjs/testing` + testcontainers (Postgres + Redis) + supertest.

## Global Constraints

- **Design doc:** `docs/superpowers/specs/2026-09-04-remember-payer-after-match-design.md` — read it before starting; every task's requirements implicitly include it.
- **No backend production code.** If a task seems to need a backend endpoint/use case/DTO change, stop — the design forbids it.
- **TDD:** RED → GREEN → REFACTOR for every behavior change. Observe the failing test before writing production code. Migrations/config are the only exceptions and there are none here.
- **Money:** integers in VND units, never float (not touched here, but do not introduce float).
- **FE conventions:** single quotes, semicolons, 2-space indent (Biome). `import type` for pure types. No `any` in production code (allowed in tests). Vietnamese user-facing copy.
- **FE test commands:** `pnpm --filter @casso-ar/frontend test -- <pattern>` (Vitest), `npx tsc --noEmit -p apps/frontend/tsconfig.json`. The `@casso-ar/shared-types` package must be built once (`pnpm --filter @casso-ar/shared-types build`) or Vitest fails to resolve it.
- **Backend e2e command:** `pnpm --filter @casso-ar/backend test:e2e -- --testPathPattern webhook-matching` (needs Docker).
- **Attribution — every commit message ends with these two trailer lines:**
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01UxN6YzEyN8piCA7aeW4Swe
  ```
  (The husky `prepare-commit-msg` hook adds the `Co-authored-by: Orca` trailer automatically — do not add it by hand.)
- **PR description ends with:** `🤖 Generated with [Claude Code](https://claude.com/claude-code)`
- **Branch / worktree:** work in `.worktrees/feat/remember-payer-after-match` on branch `feat/remember-payer-after-match` (already created). Do not work on `main`.
- **Wait for user review before opening the PR / merging** (Task 7 stops at "push + create PR").

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `apps/frontend/src/features/exceptions/components/split-match-dialog.tsx` | The single-transaction match dialog. Gains: a `rememberPayer` checkbox, derived "chosen customer", and a fire-and-forget call to save the payer account after a successful match. | Modify |
| `apps/frontend/src/features/exceptions/components/split-match-dialog.spec.tsx` | Vitest component tests for the dialog. Gains ~8 new cases. | Modify |
| `apps/backend/test/webhook-matching.e2e-spec.ts` | e2e proving: match confirmed → payer link created via `CreateCustomerBankAccountUseCase` → a second webhook from the same account is prioritized toward that customer. | Modify (one new `it`) |
| `docs/wayfinder/feature-map.md` | Ticket tracking. | Modify |

No new files. All behavior lives in `split-match-dialog.tsx`.

---

## Task 1: Checkbox — render, hide when no account number, default checked

**Files:**
- Modify: `apps/frontend/src/features/exceptions/components/split-match-dialog.tsx`
- Test: `apps/frontend/src/features/exceptions/components/split-match-dialog.spec.tsx`

**Interfaces:**
- Consumes (existing, from the codebase): `SplitMatchDialog` props `{ tx: BankTransaction; aiRecommendation?; payer?: Payer | null; open; onOpenChange }`. `BankTransaction.counterpartyAccountNumber: string | null`. `Payer.linkedCustomers: { customerId: string; customerName: string }[]`. `MatchingCandidate.customerId: string`, `.customerName: string | null`. `Checkbox` from `@/components/ui/checkbox` (Radix; renders `role="checkbox"`, toggled via `onCheckedChange(checked: boolean | 'indeterminate')`).
- Produces (later tasks rely on these names): component-scope constants `accountNumber: string | null` (`tx.counterpartyAccountNumber?.trim() || null`), `chosenCandidate` (first `sortedCandidates` entry with a positive amount), `chosenCustomerId: string | null`, `chosenCustomerName: string | null`, state `rememberPayer: boolean` / setter `setRememberPayer`, `showRememberCheckbox: boolean`. The checkbox has accessible name `"Ghi nhớ tài khoản người chuyển cho khách hàng này"`.

- [ ] **Step 1: Write the failing tests**

Add to `split-match-dialog.spec.tsx`. First extend the file's mock of `@/lib/api-client` to also export `getApiErrorDetails` (needed by Task 4 but add now so the module shape is stable) and add a `sonner` mock + a `customers-api`-free approach (the real `createCustomerBankAccount` runs through the already-mocked `postWithIdempotency`). At the top of the file, replace the existing `vi.mock('@/lib/api-client', ...)` block's returned object by adding these two keys alongside `apiRequest` / `getApiErrorCode` / `postWithIdempotency`:

```ts
  getApiErrorDetails: (error: unknown) => {
    if (typeof error !== 'object' || error === null || !('response' in error)) {
      return undefined;
    }
    const response = (error as { response?: unknown }).response;
    if (typeof response !== 'object' || response === null || !('data' in response)) {
      return undefined;
    }
    const data = (response as { data?: unknown }).data;
    if (typeof data !== 'object' || data === null || !('details' in data)) {
      return undefined;
    }
    const details = (data as { details?: unknown }).details;
    return typeof details === 'object' && details !== null
      ? (details as Record<string, unknown>)
      : undefined;
  },
```

Add a `sonner` mock near the other `vi.mock` calls:

```ts
const { toastSuccess, toastWarning, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock('sonner', () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    warning: (...a: unknown[]) => toastWarning(...a),
    error: (...a: unknown[]) => toastError(...a),
  },
}));
```

Add `toastSuccess.mockClear(); toastWarning.mockClear(); toastError.mockClear();` to the existing `beforeEach`.

Add a render helper that accepts a `payer` and lets the caller override `tx` and capture `onOpenChange`:

```ts
function renderWithPayer(opts?: {
  txOverrides?: Partial<typeof tx>;
  payer?: { accountNumberMasked: string; name: string; linkedCustomers: { customerId: string; customerName: string }[] } | null;
  onOpenChange?: (v: boolean) => void;
}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const onOpenChange = opts?.onOpenChange ?? vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <SplitMatchDialog
        tx={{ ...tx, ...opts?.txOverrides }}
        payer={opts?.payer ?? { accountNumberMasked: '****6789', name: 'Company C', linkedCustomers: [] }}
        open
        onOpenChange={onOpenChange}
      />
    </QueryClientProvider>,
  );
  return { onOpenChange };
}
```

Then the tests:

```ts
describe('remember payer account', () => {
  const REMEMBER_LABEL = 'Ghi nhớ tài khoản người chuyển cho khách hàng này';

  it('shows the remember checkbox, checked, when the transaction has an account number', async () => {
    apiRequest.mockResolvedValue(candidates);
    renderWithPayer();
    const box = await screen.findByRole('checkbox', { name: REMEMBER_LABEL });
    expect(box).toBeChecked();
  });

  it('hides the remember checkbox when the transaction has no account number', async () => {
    apiRequest.mockResolvedValue(candidates);
    renderWithPayer({ txOverrides: { counterpartyAccountNumber: null } });
    await waitFor(() => expect(screen.getByText('80/100')).toBeInTheDocument());
    expect(
      screen.queryByRole('checkbox', { name: REMEMBER_LABEL }),
    ).not.toBeInTheDocument();
  });

  it('lets the user uncheck the remember checkbox', async () => {
    apiRequest.mockResolvedValue(candidates);
    renderWithPayer();
    const box = await screen.findByRole('checkbox', { name: REMEMBER_LABEL });
    fireEvent.click(box);
    expect(box).not.toBeChecked();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @casso-ar/frontend test -- split-match-dialog`
Expected: the 3 new tests FAIL (`Unable to find an accessible element with the role "checkbox"` / for the hide test it will pass trivially only if nothing renders — but the "shows … checked" and "lets the user uncheck" fail).

- [ ] **Step 3: Implement the checkbox**

In `split-match-dialog.tsx`:

Add imports (keep alphabetical grouping consistent with the file):

```ts
import { Checkbox } from '@/components/ui/checkbox';
```

Add state next to the other `useState` calls (after `const [allocationError, setAllocationError] = useState<string | null>(null);`):

```ts
  const [rememberPayer, setRememberPayer] = useState(true);
```

In the existing `useEffect(() => { if (open) { ... } }, [open])`, add `setRememberPayer(true);` alongside the other resets.

Add derived values right after the existing `allocations` / `amountsAreIntegers` / `valid` block:

```ts
  const chosenCandidate = sortedCandidates.find(
    (candidate) => Number(amounts[candidate.receivableId]) > 0,
  );
  const chosenCustomerId = chosenCandidate?.customerId ?? null;
  const chosenCustomerName = chosenCandidate?.customerName ?? null;
  const accountNumber = tx.counterpartyAccountNumber?.trim() || null;
  const showRememberCheckbox = accountNumber !== null;
```

Render the checkbox — insert it immediately after the closing `)}` of the `{payer && (...)}` payer panel block and before the `<div>` that holds `<p className="text-sm font-medium">Nội dung chuyển khoản</p>`:

```tsx
          {showRememberCheckbox && (
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                className="mt-0.5"
                checked={rememberPayer}
                onCheckedChange={(value) => setRememberPayer(value === true)}
                aria-label="Ghi nhớ tài khoản người chuyển cho khách hàng này"
              />
              <span>Ghi nhớ tài khoản người chuyển cho khách hàng này</span>
            </label>
          )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @casso-ar/frontend test -- split-match-dialog`
Expected: all 3 new tests PASS, and every pre-existing test in the file still PASSES.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/exceptions/components/split-match-dialog.tsx apps/frontend/src/features/exceptions/components/split-match-dialog.spec.tsx
git commit -m "feat: remember-payer checkbox in the match dialog (#380)"
```

---

## Task 2: Hide when already linked to the chosen customer; warn + auto-uncheck for a different customer

**Files:**
- Modify: `apps/frontend/src/features/exceptions/components/split-match-dialog.tsx`
- Test: `apps/frontend/src/features/exceptions/components/split-match-dialog.spec.tsx`

**Interfaces:**
- Consumes: everything Task 1 produced (`accountNumber`, `chosenCustomerId`, `rememberPayer`, `setRememberPayer`, `showRememberCheckbox`), plus `payer.linkedCustomers`.
- Produces: refined `showRememberCheckbox` (also false when `chosenCustomerId` is already in `payer.linkedCustomers`); new derived `linkedToDifferentCustomer: boolean` and `otherLinkedCustomerNames: string[]`; an inline hint `<span>` with text starting `"Tài khoản này đang liên kết với "` shown when `linkedToDifferentCustomer`.

- [ ] **Step 1: Write the failing tests**

Add inside the `describe('remember payer account', ...)` block. Note both `candidates` have `customerId: 'c1'`, so a single positive amount on the first row resolves the chosen customer to `c1`.

```ts
  it('hides the checkbox once the chosen customer is already linked to this account', async () => {
    apiRequest.mockResolvedValue(candidates);
    renderWithPayer({
      payer: {
        accountNumberMasked: '****6789',
        name: 'Company C',
        linkedCustomers: [{ customerId: 'c1', customerName: 'Công ty An Phát' }],
      },
    });
    await waitFor(() => expect(screen.getByText('80/100')).toBeInTheDocument());
    // Before any amount: no chosen customer yet -> checkbox visible.
    expect(
      screen.getByRole('checkbox', { name: REMEMBER_LABEL }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getAllByLabelText(/số tiền phân bổ/i)[0], {
      target: { value: '1000000' },
    });
    await waitFor(() =>
      expect(
        screen.queryByRole('checkbox', { name: REMEMBER_LABEL }),
      ).not.toBeInTheDocument(),
    );
  });

  it('auto-unchecks and warns when the account belongs to a different customer', async () => {
    apiRequest.mockResolvedValue(candidates);
    renderWithPayer({
      payer: {
        accountNumberMasked: '****6789',
        name: 'Company C',
        linkedCustomers: [{ customerId: 'other', customerName: 'Công ty Khác' }],
      },
    });
    await waitFor(() => expect(screen.getByText('80/100')).toBeInTheDocument());
    fireEvent.change(screen.getAllByLabelText(/số tiền phân bổ/i)[0], {
      target: { value: '1000000' },
    });
    const box = await screen.findByRole('checkbox', { name: REMEMBER_LABEL });
    await waitFor(() => expect(box).not.toBeChecked());
    expect(
      screen.getByText(/Tài khoản này đang liên kết với Công ty Khác/),
    ).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @casso-ar/frontend test -- split-match-dialog`
Expected: both new tests FAIL — the checkbox stays visible after entering an amount, and it stays checked with no hint.

- [ ] **Step 3: Implement**

In `split-match-dialog.tsx`, replace the `showRememberCheckbox` line from Task 1 and add the linked-customer derivations:

```ts
  const linkedCustomers = payer?.linkedCustomers ?? [];
  const alreadyLinkedToChosen =
    chosenCustomerId !== null &&
    linkedCustomers.some((c) => c.customerId === chosenCustomerId);
  const otherLinkedCustomerNames = linkedCustomers
    .filter((c) => c.customerId !== chosenCustomerId)
    .map((c) => c.customerName);
  const linkedToDifferentCustomer =
    chosenCustomerId !== null &&
    !alreadyLinkedToChosen &&
    otherLinkedCustomerNames.length > 0;
  const showRememberCheckbox =
    accountNumber !== null && !alreadyLinkedToChosen;
```

Add an effect that unchecks once each time the different-customer condition turns true (placed after the existing `open` reset effect):

```ts
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally fires only on the linked-to-different-customer transition so the user can re-check deliberately
  useEffect(() => {
    if (linkedToDifferentCustomer) {
      setRememberPayer(false);
    }
  }, [linkedToDifferentCustomer]);
```

Extend the checkbox label's `<span>` to carry the hint:

```tsx
              <span>
                Ghi nhớ tài khoản người chuyển cho khách hàng này
                {linkedToDifferentCustomer && (
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Tài khoản này đang liên kết với{' '}
                    {otherLinkedCustomerNames.join(', ')}. Bỏ tích để không ghi
                    nhớ.
                  </span>
                )}
              </span>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @casso-ar/frontend test -- split-match-dialog`
Expected: all tests in the file PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/exceptions/components/split-match-dialog.tsx apps/frontend/src/features/exceptions/components/split-match-dialog.spec.tsx
git commit -m "feat: hide/warn remember-payer for already-linked customers (#380)"
```

---

## Task 3: Call the create endpoint after a successful match

**Files:**
- Modify: `apps/frontend/src/features/exceptions/components/split-match-dialog.tsx`
- Test: `apps/frontend/src/features/exceptions/components/split-match-dialog.spec.tsx`

**Interfaces:**
- Consumes: Task 1/2 derivations (`rememberPayer`, `chosenCustomerId`, `chosenCustomerName`, `accountNumber`), the existing `onMatch()` and its `splitMatch.mutate(..., { onSuccess })`.
- Consumes (from the codebase): `createCustomerBankAccount(customerId: string, input: { accountNumber: string; acknowledgeExistingLinks?: boolean }): Promise<CustomerBankAccount>` from `@/features/customers/api/customers-api` — internally does `postWithIdempotency('/api/v1/customers/${customerId}/bank-accounts', input)`. `toast` from `sonner`.
- Produces: a module-level `async function rememberPayerAccount(customerId: string, customerName: string | null, accountNumber: string): Promise<void>` in `split-match-dialog.tsx`; `onMatch`'s `onSuccess` now closes the dialog then fires `void rememberPayerAccount(...)` when `rememberPayer && chosenCustomerId && accountNumber`.

- [ ] **Step 1: Write the failing tests**

The file already routes `postWithIdempotency` → `apiRequest`, so the real `createCustomerBankAccount` will call `apiRequest({ url: '/api/v1/customers/c1/bank-accounts', method: 'POST', data: { accountNumber: '999' }, headers: { 'Idempotency-Key': 'test-key' } })`. `apiRequest.mockResolvedValue(candidates)` currently answers *every* call — for these tests use `mockImplementation` to branch by URL.

```ts
  it('creates the payer link after a successful match when checked', async () => {
    apiRequest.mockImplementation((cfg: { url: string }) => {
      if (cfg.url === '/api/v1/bank-transactions/bt9/match') return Promise.resolve({ id: 'bt9' });
      if (cfg.url === '/api/v1/customers/c1/bank-accounts') return Promise.resolve({ id: 'cba1' });
      return Promise.resolve(candidates);
    });
    const { onOpenChange } = renderWithPayer();

    await waitFor(() => expect(screen.getByText('80/100')).toBeInTheDocument());
    fireEvent.change(screen.getAllByLabelText(/số tiền phân bổ/i)[0], {
      target: { value: '50000000' },
    });
    fireEvent.click(screen.getByRole('button', { name: /khớp giao dịch/i }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/v1/customers/c1/bank-accounts',
          method: 'POST',
          data: { accountNumber: '999' },
        }),
      ),
    );
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(
        expect.stringContaining('Công ty An Phát'),
      ),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('does not create the payer link when the checkbox is unchecked', async () => {
    apiRequest.mockImplementation((cfg: { url: string }) => {
      if (cfg.url === '/api/v1/bank-transactions/bt9/match') return Promise.resolve({ id: 'bt9' });
      return Promise.resolve(candidates);
    });
    renderWithPayer();

    await waitFor(() => expect(screen.getByText('80/100')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('checkbox', { name: REMEMBER_LABEL }));
    fireEvent.change(screen.getAllByLabelText(/số tiền phân bổ/i)[0], {
      target: { value: '50000000' },
    });
    fireEvent.click(screen.getByRole('button', { name: /khớp giao dịch/i }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({ url: '/api/v1/bank-transactions/bt9/match' }),
      ),
    );
    expect(apiRequest).not.toHaveBeenCalledWith(
      expect.objectContaining({ url: '/api/v1/customers/c1/bank-accounts' }),
    );
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @casso-ar/frontend test -- split-match-dialog`
Expected: "creates the payer link…" FAILS (`/api/v1/customers/c1/bank-accounts` never called; `toastSuccess` never called). "does not create…" PASSES already (nothing calls it yet) — that's fine, it locks the behavior.

- [ ] **Step 3: Implement**

In `split-match-dialog.tsx`:

Add imports:

```ts
import { toast } from 'sonner';
import { createCustomerBankAccount } from '@/features/customers/api/customers-api';
import { getApiErrorCode, getApiErrorDetails } from '@/lib/api-client';
```

Add the module-level helper (above the `SplitMatchDialog` component, next to `AiRecommendationNotice`):

```ts
async function rememberPayerAccount(
  customerId: string,
  customerName: string | null,
  accountNumber: string,
): Promise<void> {
  try {
    await createCustomerBankAccount(customerId, { accountNumber });
    toast.success(
      `Đã ghi nhớ tài khoản người chuyển${
        customerName ? ` cho ${customerName}` : ''
      }.`,
    );
  } catch (error) {
    const code = getApiErrorCode(error);
    if (code === 'CONFLICT') {
      const names = getApiErrorDetails(error)?.linkedCustomerNames;
      if (Array.isArray(names) && names.length > 0) {
        toast.warning(
          `Tài khoản này đang liên kết với ${names.join(', ')}. Chưa ghi nhớ.`,
        );
      }
      // A same-customer duplicate means the link already exists — nothing to do.
      return;
    }
    if (code === 'VALIDATION_ERROR') {
      toast.warning('Số tài khoản không hợp lệ, chưa ghi nhớ.');
      return;
    }
    toast.error('Không ghi nhớ được tài khoản người chuyển.');
  }
}
```

Change `onMatch()`'s `onSuccess` from `onSuccess: () => onOpenChange(false),` to:

```ts
        onSuccess: () => {
          // The match is the primary action — close first, then the aside.
          onOpenChange(false);
          if (rememberPayer && chosenCustomerId && accountNumber) {
            void rememberPayerAccount(
              chosenCustomerId,
              chosenCustomerName,
              accountNumber,
            );
          }
        },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @casso-ar/frontend test -- split-match-dialog`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/exceptions/components/split-match-dialog.tsx apps/frontend/src/features/exceptions/components/split-match-dialog.spec.tsx
git commit -m "feat: save the payer account after a confirmed match (#380)"
```

---

## Task 4: Failure of the save must not affect the match

**Files:**
- Modify: `apps/frontend/src/features/exceptions/components/split-match-dialog.spec.tsx` (tests only — production behavior from Task 3 already satisfies this; if a test fails, fix `split-match-dialog.tsx`)
- Test: same

**Interfaces:**
- Consumes: `rememberPayerAccount` and the `onSuccess` wiring from Task 3; `toastWarning` / `toastError` mocks from Task 1.

- [ ] **Step 1: Write the failing tests**

```ts
  it('warns and keeps the match on a cross-customer conflict from the save', async () => {
    apiRequest.mockImplementation((cfg: { url: string }) => {
      if (cfg.url === '/api/v1/bank-transactions/bt9/match') return Promise.resolve({ id: 'bt9' });
      if (cfg.url === '/api/v1/customers/c1/bank-accounts') {
        return Promise.reject({
          response: {
            data: {
              errorCode: 'CONFLICT',
              details: { linkedCustomerNames: ['Công ty Khác'] },
            },
          },
        });
      }
      return Promise.resolve(candidates);
    });
    const { onOpenChange } = renderWithPayer();

    await waitFor(() => expect(screen.getByText('80/100')).toBeInTheDocument());
    fireEvent.change(screen.getAllByLabelText(/số tiền phân bổ/i)[0], {
      target: { value: '50000000' },
    });
    fireEvent.click(screen.getByRole('button', { name: /khớp giao dịch/i }));

    await waitFor(() =>
      expect(toastWarning).toHaveBeenCalledWith(
        expect.stringContaining('Công ty Khác'),
      ),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false); // match still confirmed
    expect(screen.queryByRole('alert')).not.toBeInTheDocument(); // no match error surfaced
  });

  it('shows a generic error and keeps the match when the save fails outright', async () => {
    apiRequest.mockImplementation((cfg: { url: string }) => {
      if (cfg.url === '/api/v1/bank-transactions/bt9/match') return Promise.resolve({ id: 'bt9' });
      if (cfg.url === '/api/v1/customers/c1/bank-accounts') {
        return Promise.reject(new Error('network down'));
      }
      return Promise.resolve(candidates);
    });
    const { onOpenChange } = renderWithPayer();

    await waitFor(() => expect(screen.getByText('80/100')).toBeInTheDocument());
    fireEvent.change(screen.getAllByLabelText(/số tiền phân bổ/i)[0], {
      target: { value: '50000000' },
    });
    fireEvent.click(screen.getByRole('button', { name: /khớp giao dịch/i }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        'Không ghi nhớ được tài khoản người chuyển.',
      ),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
```

- [ ] **Step 2: Run tests**

Run: `pnpm --filter @casso-ar/frontend test -- split-match-dialog`
Expected: both PASS immediately if Task 3 was implemented correctly (the helper swallows all errors and the dialog already closed). If either FAILS, the bug is in Task 3's `rememberPayerAccount` error branches or the `onSuccess` ordering — fix `split-match-dialog.tsx` so the match close happens before the save call and the save never rethrows.

- [ ] **Step 3: (only if a test failed) fix `split-match-dialog.tsx`**

Ensure `rememberPayerAccount` has no `throw` on any path and `onOpenChange(false)` is called before `rememberPayerAccount` in `onSuccess`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @casso-ar/frontend test -- split-match-dialog`
Expected: all tests in the file PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/exceptions/components/split-match-dialog.spec.tsx apps/frontend/src/features/exceptions/components/split-match-dialog.tsx
git commit -m "test: payer-save failure never blocks the confirmed match (#380)"
```

---

## Task 5: Frontend verification gate

**Files:** none (verification only)

- [ ] **Step 1: Build shared types (once)**

Run: `pnpm --filter @casso-ar/shared-types build`
Expected: exits 0, produces `packages/shared-types/dist`.

- [ ] **Step 2: Full frontend test suite**

Run: `pnpm --filter @casso-ar/frontend test`
Expected: all files pass. If `admin-dashboard-page`, `reports-page`, or `app-routes` time out, that is a known Turbo-parallelism flake unrelated to this change — re-run each in isolation (`pnpm --filter @casso-ar/frontend test -- <file>`) to confirm they pass alone, and note it.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p apps/frontend/tsconfig.json`
Expected: exits 0, no errors.

- [ ] **Step 4: Lint / format**

Run: `npx biome check --write apps/frontend/src`
Expected: no remaining errors. Re-run Step 2 for the dialog spec if Biome reformatted anything: `pnpm --filter @casso-ar/frontend test -- split-match-dialog`.

- [ ] **Step 5: Commit any formatting changes**

```bash
git add -A
git commit -m "chore: biome format for remember-payer changes (#380)" || echo "nothing to format"
```

---

## Task 6: Backend e2e — match → remember → prioritize

**Files:**
- Modify: `apps/backend/test/webhook-matching.e2e-spec.ts` (add one `it` at the end of the top-level `describe`)

**Interfaces:**
- Consumes (from the codebase): `MatchBankTransactionUseCase` (`src/modules/exception-queue/application/match-bank-transaction.usecase.ts`) — `execute({ bankTransactionId: string; allocations: { receivableId: string; amount: number }[]; version: number; allocatedByUserId: string }): Promise<BankTransaction>`. `CreateCustomerBankAccountUseCase` (`src/modules/bank-accounts/application/create-customer-bank-account.usecase.ts`) — `execute({ customerId: string; accountNumber: string; confirmedByUserId?: string; acknowledgeExistingLinks?: boolean }): Promise<CustomerBankAccount>`. Both are retrievable via `moduleRef.get(...)` because `AppModule` is booted. `tenantContext.run({ userId, organizationId, role }, cb)` supplies request scope (see the existing "lists and updates a legacy pre-migration bank-account row" test in this file for the pattern). `signCassoWebhookPayload`, `delay`, `randomUUID`, the ORM entities, `ReceivableStatus`, `InvoiceStatus`, `Role` are already imported in this file.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Write the failing test**

Add these imports at the top of `webhook-matching.e2e-spec.ts` if not already present:

```ts
import { MatchBankTransactionUseCase } from '../src/modules/exception-queue/application/match-bank-transaction.usecase';
import { CreateCustomerBankAccountUseCase } from '../src/modules/bank-accounts/application/create-customer-bank-account.usecase';
```

Add the test as the last `it` inside `describe('Webhook matching (e2e)', ...)`. It reuses the file's `organizationId`, `webhookSecret`, `app`, `dataSource`, `tenantContext`. Pick transaction ids and an account number that no other test in the file uses (`3_000_001`, `3_000_002`, `0777888999`).

```ts
  it('remembers a payer account after a confirmed match so the next webhook prioritizes that customer', async () => {
    const customerId = randomUUID();
    const invoiceId1 = randomUUID();
    const invoiceId2 = randomUUID();
    const receivableId1 = randomUUID();
    const receivableId2 = randomUUID();
    const payerAccount = '0777888999';
    const dueDate = new Date('2026-08-05T10:00:00.000Z');
    const actingUserId = randomUUID();

    await dataSource.getRepository(CustomerOrmEntity).save({
      id: customerId,
      organizationId,
      name: 'Cong ty Ghi Nho',
      taxCode: 'TAX-REMEMBER',
      email: 'remember@example.com',
      phone: '0900000090',
      defaultPaymentTermDays: 30,
      creditLimit: 100_000_000,
      priority: 1,
      createdAt: new Date(),
    });
    await dataSource.getRepository(InvoiceOrmEntity).save([
      {
        id: invoiceId1,
        organizationId,
        customerId,
        invoiceNumber: 'INV-2026-0080',
        issueDate: new Date('2026-07-01T00:00:00.000Z'),
        totalAmount: 12_000_000,
        taxAmount: 0,
        sourceType: 'MANUAL',
        fileUrl: null,
        status: InvoiceStatus.ISSUED,
        createdAt: new Date(),
      },
      {
        id: invoiceId2,
        organizationId,
        customerId,
        invoiceNumber: 'INV-2026-0081',
        issueDate: new Date('2026-07-01T00:00:00.000Z'),
        totalAmount: 12_000_000,
        taxAmount: 0,
        sourceType: 'MANUAL',
        fileUrl: null,
        status: InvoiceStatus.ISSUED,
        createdAt: new Date(),
      },
    ]);
    await dataSource.getRepository(ReceivableOrmEntity).save([
      {
        id: receivableId1,
        organizationId,
        customerId,
        invoiceId: invoiceId1,
        originalAmount: 12_000_000,
        paidAmount: 0,
        dueDate,
        status: ReceivableStatus.OPEN,
        salesRepresentativeId: null,
        createdAt: new Date(),
        closedAt: null,
        version: 1,
      },
      {
        id: receivableId2,
        organizationId,
        customerId,
        invoiceId: invoiceId2,
        originalAmount: 12_000_000,
        paidAmount: 0,
        dueDate,
        status: ReceivableStatus.OPEN,
        salesRepresentativeId: null,
        createdAt: new Date(),
        closedAt: null,
        version: 1,
      },
    ]);

    // 1. First webhook from an UNKNOWN payer account, referencing invoice 0080
    //    in the content -> deterministic reference-code match routes it to
    //    PENDING_REVIEW (no customer_bank_accounts link yet).
    const firstId = 3_000_001;
    const firstPayload = {
      error: 0,
      data: {
        id: firstId,
        amount: 12_000_000,
        transactionDateTime: '2026-08-05 10:00:00',
        description: 'Thanh toan INV-2026-0080',
        accountNumber: '99887766',
        counterAccountNumber: payerAccount,
        counterAccountName: 'NGUOI TRA HO',
      },
    };
    await request(app.getHttpServer())
      .post('/api/v1/webhooks/casso-balance-hook')
      .set('X-Casso-Signature', signCassoWebhookPayload(firstPayload, webhookSecret))
      .send(firstPayload)
      .expect(200, { received: true, duplicate: false });

    const txRepo = dataSource.getRepository(BankTransactionOrmEntity);
    const deadline1 = Date.now() + 10_000;
    let firstTx: BankTransactionOrmEntity | null = null;
    while (Date.now() < deadline1) {
      firstTx = await txRepo.findOneBy({ providerTransactionId: String(firstId) });
      if (firstTx && firstTx.status !== 'PENDING') break;
      await delay(100);
    }
    expect(firstTx?.status).toBe('PENDING_REVIEW');

    const runAsUser = <T>(cb: () => Promise<T>): Promise<T> =>
      tenantContext.run(
        { userId: actingUserId, organizationId, role: Role.OWNER },
        cb,
      );

    // 2. Confirm the match against receivable 1 (the confirm-match flow).
    const matchUseCase = app.get(MatchBankTransactionUseCase);
    await runAsUser(() =>
      matchUseCase.execute({
        bankTransactionId: firstTx?.id ?? '',
        allocations: [{ receivableId: receivableId1, amount: 12_000_000 }],
        version: firstTx?.version ?? 0,
        allocatedByUserId: actingUserId,
      }),
    );
    expect(
      (await txRepo.findOneBy({ providerTransactionId: String(firstId) }))?.status,
    ).toBe('MATCHED');

    // 3. Remember the payer account for this customer — exactly what the FE
    //    "Ghi nhớ tài khoản người chuyển" checkbox triggers via
    //    POST /api/v1/customers/:id/bank-accounts.
    const createLinkUseCase = app.get(CreateCustomerBankAccountUseCase);
    await runAsUser(() =>
      createLinkUseCase.execute({
        customerId,
        accountNumber: payerAccount,
        confirmedByUserId: actingUserId,
      }),
    );
    const link = await runAsUser(() =>
      bankAccountRepo.findActiveByAccountNumber(payerAccount),
    );
    expect(link).toEqual([expect.objectContaining({ customerId })]);

    // 4. Second webhook from the SAME payer account, with NO invoice reference
    //    in the content. Only the remembered link can point it at the customer.
    const secondId = 3_000_002;
    const secondPayload = {
      error: 0,
      data: {
        id: secondId,
        amount: 12_000_000,
        transactionDateTime: '2026-08-06 09:00:00',
        description: 'chuyen khoan',
        accountNumber: '99887766',
        counterAccountNumber: payerAccount,
        counterAccountName: 'NGUOI TRA HO',
      },
    };
    await request(app.getHttpServer())
      .post('/api/v1/webhooks/casso-balance-hook')
      .set('X-Casso-Signature', signCassoWebhookPayload(secondPayload, webhookSecret))
      .send(secondPayload)
      .expect(200, { received: true, duplicate: false });

    const deadline2 = Date.now() + 10_000;
    let secondTx: BankTransactionOrmEntity | null = null;
    while (Date.now() < deadline2) {
      secondTx = await txRepo.findOneBy({ providerTransactionId: String(secondId) });
      if (secondTx && secondTx.status !== 'PENDING') break;
      await delay(100);
    }
    // The remembered account narrows candidates to this customer and adds the
    // +10 bank-account score; with an exact single open receivable of matching
    // amount this auto-matches. If scoring weights change and it lands in
    // review instead, assert the top candidate is receivable 2 for this customer.
    if (secondTx?.status === 'MATCHED') {
      const paid = await dataSource
        .getRepository(ReceivableOrmEntity)
        .findOneBy({ id: receivableId2 });
      expect(paid?.status).toBe('PAID');
    } else {
      expect(secondTx?.status).toBe('PENDING_REVIEW');
      const candidates = await runAsUser(() =>
        app
          .get(MatchBankTransactionUseCase)
          ? Promise.resolve(null)
          : Promise.resolve(null),
      );
      // Fallback assertion via the matching_candidates table:
      const rows = await dataSource.query(
        'SELECT "receivableId", "customerBankAccountScore" FROM matching_candidates WHERE "bankTransactionId" = $1 ORDER BY "totalScore" DESC',
        [secondTx?.id],
      );
      expect(rows[0]?.receivableId).toBe(receivableId2);
      expect(Number(rows[0]?.customerBankAccountScore)).toBe(10);
    }
  }, 30_000);
```

> Simplify before committing: the `else` branch's dead `candidates`/`app.get` lines are a copy artifact — delete them, keep only the `dataSource.query` fallback assertion. The primary expectation is `secondTx?.status === 'MATCHED'` and `receivable 2 PAID`.

- [ ] **Step 2: Run the test to verify it fails first without the create-link step**

Temporarily comment out step 3 (the `createLinkUseCase.execute(...)` call and the `link` assertion), then run:
`pnpm --filter @casso-ar/backend test:e2e -- --testPathPattern webhook-matching -t "remembers a payer account"`
Expected: FAIL at step 4 — the second webhook does NOT auto-match / does NOT prioritize receivable 2 (no link exists). This proves the test actually exercises the remembered-link effect.

- [ ] **Step 3: Restore step 3 and run again**

Uncomment the create-link step. Run:
`pnpm --filter @casso-ar/backend test:e2e -- --testPathPattern webhook-matching -t "remembers a payer account"`
Expected: PASS.

- [ ] **Step 4: Run the whole webhook-matching e2e file**

Run: `pnpm --filter @casso-ar/backend test:e2e -- --testPathPattern webhook-matching`
Expected: every `it` passes (the new one plus the pre-existing #382 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/test/webhook-matching.e2e-spec.ts
git commit -m "test: e2e for remembering a payer account after a confirmed match (#380)"
```

---

## Task 7: Feature map, full verify, push, open PR

**Files:**
- Modify: `docs/wayfinder/feature-map.md`

- [ ] **Step 1: Update the feature map**

In `docs/wayfinder/feature-map.md`, under `## Frontier` → `**In progress:**`, add a bullet (mirror the #382 entry's style):

```markdown
- #380 — Remember payer bank account after a confirmed match: a "Ghi nhớ tài khoản người chuyển cho khách hàng này" checkbox in `SplitMatchDialog`; on match success it fires a fire-and-forget `POST /customers/:id/bank-accounts` for the matched customer (reusing #382's endpoint). Checkbox hidden when the transaction has no account number or the chosen customer is already linked; auto-unchecked with a hint when the account belongs to another customer; cross-customer 409 is a warning only, never a silent reassign. No backend production code — AC#5 ("later transaction prioritizes that customer") already ships in #382's matching engine. Branch `feat/remember-payer-after-match`.
```

Also change `**Next available tickets** ... - #380 — ...` line: remove #380 from "Next available" (it is now in progress).

- [ ] **Step 2: Commit the doc**

```bash
git add docs/wayfinder/feature-map.md
git commit -m "docs: track #380 in the feature map (#380)"
```

- [ ] **Step 3: Full verify**

Run: `pnpm verify`
Expected: lint + type-check + unit pass. The only acceptable failure is the pre-existing Turbo frontend flake (`admin-dashboard-page` / `reports-page` / `app-routes` 5s/15s timeouts) — confirm those files pass in isolation and note it. Anything else must be fixed.

- [ ] **Step 4: Domain check (no-op expected)**

Run: `cd apps/backend && npm run arch-check`
Expected: passes — there is no backend production change, but run it to confirm nothing regressed.

- [ ] **Step 5: Push and open the PR**

```bash
git push -u origin feat/remember-payer-after-match
gh pr create --repo lengocanh2005it/casso-ledger \
  --title "feat: remember payer bank account after confirmed match" \
  --body "$(cat <<'EOF'
Closes #380.

Frontend-only (+ one backend e2e). After a user confirms a match in the
Exception Queue, a checkbox in `SplitMatchDialog` opts in to saving the
transaction's payer account for the matched customer, via the existing
`POST /api/v1/customers/:customerId/bank-accounts` endpoint (#382).

- Checkbox pre-checked; hidden when the transaction has no account number,
  or when the chosen customer is already linked to that account.
- Auto-unchecked with an inline hint when the account belongs to a
  different customer; a cross-customer 409 is a warning toast only —
  never a silent reassign (AC#4).
- The save is fired after the match succeeds and the dialog closes; any
  failure is a toast and never blocks or undoes the match (AC#6).
- No backend production code. AC#5 ("a later transaction from a saved
  account prioritizes that customer") already ships in #382's matching
  engine; the new e2e proves the full loop through the confirm-match entry
  point.

Design: `docs/superpowers/specs/2026-09-04-remember-payer-after-match-design.md`
Plan: `docs/superpowers/plans/2026-09-04-remember-payer-after-match.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 6: Stop — wait for user review**

Do not merge. Report the PR URL and the verification evidence (frontend suite result, e2e result, `pnpm verify` result).

---

## Self-Review

**1. Spec coverage**

| Spec section | Task |
|---|---|
| §1.1 (#382 already delivers AC#5 — no matching-engine work) | Design constraint; Task 6 e2e proves it end-to-end |
| §1.2 in scope: checkbox + fire-and-forget call | Tasks 1–4 |
| §1.2 in scope: FE component tests | Tasks 1–4 |
| §1.2 in scope: one backend e2e | Task 6 |
| §1.3 out of scope (no backend code, no batch, no mark-prepaid, no inline ack) | Global Constraints + not implemented anywhere in the plan |
| §2.2 data available at confirm time (raw `tx.counterpartyAccountNumber`, `payer.linkedCustomers`, chosen customer from first allocation) | Task 1 (`accountNumber`, `chosenCustomerId`), Task 2 (`linkedCustomers`) |
| §2.3 no RBAC gap | Noted in design; nothing to implement |
| §3.1 new state `rememberPayer` | Task 1 Step 3 |
| §3.2 resolved customer derivation | Task 1 Step 3 (`chosenCandidate`/`chosenCustomerId`/`chosenCustomerName`) |
| §3.3 checkbox shown only with account number; hidden when already linked to chosen; auto-uncheck + hint for different customer; pre-checked before amounts entered | Task 1 (account number, default checked) + Task 2 (already-linked hide, different-customer uncheck+hint) |
| §3.4 on match success: close first, then fire-and-forget `rememberPayerAccount` | Task 3 Step 3 |
| §3.5 toast outcomes (success / 409+names / 409 same-customer silent / 400 / generic) | Task 3 (`rememberPayerAccount` helper) + Task 4 (tests for 409+names and generic) |
| §3.6 declining = no call | Task 3 test "does not create … when unchecked" |
| §3.7 idempotency / partial-unique race | `createCustomerBankAccount` uses `postWithIdempotency`; 409 handled in Task 3 helper; noted, no extra code |
| §4 backend reused unchanged | Global Constraints |
| §5.1 FE component tests (8 slices) | Tasks 1–4 (3 + 2 + 2 + 2 = 9 cases, covering all 8 listed) |
| §5.2 backend e2e (webhook1 → PENDING_REVIEW → match → create link → webhook2 → prioritized) | Task 6 |
| §5.3 verification gate (`pnpm verify`, e2e, domain-check) | Tasks 5 + 7 |
| §6 AC mapping | Covered by the tasks above; Task 6 covers AC#5/#7-e2e, Tasks 1–4 cover AC#1/#2/#4/#6/#7-FE |
| §7 effort: small | Reflected — 7 tasks, one production file |

No gaps.

**2. Placeholder scan**

Every code step has a full code block. The only "if it failed" step is Task 4 Step 3, which is a conditional fix with explicit instructions (no throw; ordering), acceptable because Task 3 should already satisfy it. Task 6 Step 1 contains a flagged copy artifact (`else` branch dead lines) with an explicit "delete before committing" instruction and the real fallback assertion spelled out — not a placeholder, a cleanup note. No `TBD`/`TODO`/"add error handling"/"similar to Task N".

**3. Type consistency**

- `accountNumber` (`string | null`), `chosenCustomerId` (`string | null`), `chosenCustomerName` (`string | null`), `rememberPayer` (`boolean`), `showRememberCheckbox` (`boolean`), `linkedToDifferentCustomer` (`boolean`), `otherLinkedCustomerNames` (`string[]`) — defined in Task 1/2, used consistently in Task 3's `onSuccess` guard (`rememberPayer && chosenCustomerId && accountNumber`).
- `rememberPayerAccount(customerId: string, customerName: string | null, accountNumber: string)` — signature identical in Task 3 (definition) and its single call site in `onSuccess`.
- `createCustomerBankAccount(customerId, { accountNumber })` — matches the real signature (`CreateCustomerBankAccountInput = { accountNumber: string; acknowledgeExistingLinks?: boolean }`), `acknowledgeExistingLinks` deliberately omitted.
- `getApiErrorCode` / `getApiErrorDetails` — real exports of `@/lib/api-client`; the spec mock is extended in Task 1 Step 1 to include `getApiErrorDetails` so the mocked module shape matches.
- e2e: `MatchBankTransactionUseCase.execute` and `CreateCustomerBankAccountUseCase.execute` input shapes quoted from source in Task 6 Interfaces; `bankAccountRepo.findActiveByAccountNumber` returns `CustomerBankAccount[]` (asserted as an array).

No mismatches found.
