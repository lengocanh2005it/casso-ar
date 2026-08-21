# Customer Bank Account Management UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a permission-aware customer bank-account card with create, edit, soft-deactivate, and reactivate flows to the frontend customer detail page for issue #234.

**Architecture:** Extend the existing customer API and TanStack Query hook files with the already-shipped bank-account contract. Keep form state in a focused create/edit dialog and list/confirmation state in a focused card component; the customer detail page only composes the card. All mutations invalidate the customer-specific bank-account query so the UI reflects the server's active/inactive state.

**Tech Stack:** React, TypeScript, TanStack Query, Axios-backed `apiRequest`/`postWithIdempotency`, Vitest, Testing Library, Sonner, and existing shadcn `Card`/`Badge`/`Dialog`/`AlertDialog`/`Input`/`Button` components.

**Spec:** `docs/superpowers/specs/2026-08-22-customer-bank-account-management-ui-design.md`

## Global Constraints

- Frontend-only: do not modify backend controllers, use cases, entities, migrations, or permissions.
- Money: N/A; account numbers stay strings and preserve leading zeroes.
- Sensitive data: only use/display `accountNumberMasked`; never reveal, copy, log, or prefill a raw account number.
- Tenant isolation: the frontend sends only the `customerId` from the route; never accept or send `organizationId`.
- RBAC: list/read UI remains visible; hide all write controls unless `hasPermission(user?.role ?? null, Permission.CUSTOMER_BANK_ACCOUNT_MANAGE)` is true.
- API contract: use `RECEIVABLE_READ` list access, `POST` for create, `PATCH` for edit/reactivation, and `DELETE` for soft deactivation.
- Idempotency: `POST` uses `postWithIdempotency`; `PATCH` and `DELETE` send `Idempotency-Key: crypto.randomUUID()`.
- Validation: frontend validates only non-empty input; backend remains authoritative for normalization, length, and duplicate checks.
- Testing: follow RED → GREEN → REFACTOR and test public UI/API behavior, not private implementation details.
- Dependencies: add no package, route, cache, shared primitive, or new design token.

---

## File Structure

```
apps/frontend/src/features/customers/
  types.ts                                      -- MODIFY: bank-account response/input interfaces
  api/customers-api.ts                          -- MODIFY: bank-account HTTP functions
  api/customers-api.spec.ts                     -- MODIFY: HTTP contract tests
  api/use-customers.ts                          -- MODIFY: query/mutation hooks and invalidation
  components/customer-bank-account-dialog.tsx  -- CREATE: create/edit form dialog
  components/customer-bank-account-dialog.spec.tsx
                                                 -- CREATE: form behavior tests
  components/customer-bank-accounts-card.tsx    -- CREATE: list states/actions/confirmations
  components/customer-bank-accounts-card.spec.tsx
                                                 -- CREATE: list/RBAC/action tests
  pages/customer-detail-page.tsx                -- MODIFY: place the card
  pages/customer-detail-page.spec.tsx           -- MODIFY: cover card in detail flow
```

The existing `customers-api.ts` and `use-customers.ts` remain the single customer-feature API/hook boundary; do not create a second bank-account feature folder for this detail-page-only flow.

---

### Task 1: Add bank-account types and HTTP functions

**Files:**
- Modify: `apps/frontend/src/features/customers/types.ts`
- Modify: `apps/frontend/src/features/customers/api/customers-api.ts`
- Test: `apps/frontend/src/features/customers/api/customers-api.spec.ts`

**Interfaces:**
- Produces `CustomerBankAccount`, `CustomerBankAccountList`, `CreateCustomerBankAccountInput`, and `UpdateCustomerBankAccountInput` for Tasks 2–4.
- Produces `fetchCustomerBankAccounts(customerId)`, `createCustomerBankAccount(customerId, input)`, `updateCustomerBankAccount(customerId, id, input)`, and `deactivateCustomerBankAccount(customerId, id)`.

- [x] **Step 1: Add the response and input interfaces**

Add to `apps/frontend/src/features/customers/types.ts`:

```typescript
export interface CustomerBankAccount {
  id: string;
  customerId: string;
  accountNumberMasked: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerBankAccountList {
  items: CustomerBankAccount[];
  total: number;
}

export interface CreateCustomerBankAccountInput {
  accountNumber: string;
}

export interface UpdateCustomerBankAccountInput {
  accountNumber?: string;
  isActive?: boolean;
}
```

- [x] **Step 2: Write the failing API contract tests**

Extend `customers-api.spec.ts` with tests for the four public functions. Mock `apiRequest` and `postWithIdempotency` through `@/lib/api-client` and assert these exact calls:

```typescript
it('lists bank accounts for one customer', async () => {
  apiRequest.mockResolvedValueOnce({ items: [], total: 0 });

  await expect(fetchCustomerBankAccounts('customer-1')).resolves.toEqual({
    items: [],
    total: 0,
  });

  expect(apiRequest).toHaveBeenCalledWith({
    url: '/api/v1/customers/customer-1/bank-accounts',
    method: 'GET',
  });
});

it('creates through the idempotent POST helper', async () => {
  const account = {
    id: 'account-1',
    customerId: 'customer-1',
    accountNumberMasked: '******2233',
    isActive: true,
    createdAt: '2026-08-22T00:00:00.000Z',
    updatedAt: '2026-08-22T00:00:00.000Z',
  };
  postWithIdempotency.mockResolvedValueOnce(account);

  await expect(
    createCustomerBankAccount('customer-1', { accountNumber: '0011 2233' }),
  ).resolves.toEqual(account);

  expect(postWithIdempotency).toHaveBeenCalledWith(
    '/api/v1/customers/customer-1/bank-accounts',
    { accountNumber: '0011 2233' },
  );
});

it('updates with PATCH and an idempotency key', async () => {
  apiRequest.mockResolvedValueOnce({ id: 'account-1' });

  await updateCustomerBankAccount('customer-1', 'account-1', {
    isActive: true,
  });

  expect(apiRequest).toHaveBeenCalledWith({
    url: '/api/v1/customers/customer-1/bank-accounts/account-1',
    method: 'PATCH',
    data: { isActive: true },
    headers: { 'Idempotency-Key': expect.any(String) },
  });
});

it('deactivates with DELETE and an idempotency key', async () => {
  apiRequest.mockResolvedValueOnce(undefined);

  await deactivateCustomerBankAccount('customer-1', 'account-1');

  expect(apiRequest).toHaveBeenCalledWith({
    url: '/api/v1/customers/customer-1/bank-accounts/account-1',
    method: 'DELETE',
    headers: { 'Idempotency-Key': expect.any(String) },
  });
});
```

- [x] **Step 3: Run the API tests and verify RED**

Run:

```bash
pnpm --filter @casso-ledger/frontend test -- src/features/customers/api/customers-api.spec.ts
```

Expected: FAIL because the four bank-account functions do not exist yet.

- [x] **Step 4: Implement the four HTTP functions**

Import the new types and add these functions to `customers-api.ts`:

```typescript
export function fetchCustomerBankAccounts(
  customerId: string,
): Promise<CustomerBankAccountList> {
  return apiRequest<CustomerBankAccountList>({
    url: `/api/v1/customers/${customerId}/bank-accounts`,
    method: 'GET',
  });
}

export function createCustomerBankAccount(
  customerId: string,
  input: CreateCustomerBankAccountInput,
): Promise<CustomerBankAccount> {
  return postWithIdempotency<CustomerBankAccount>(
    `/api/v1/customers/${customerId}/bank-accounts`,
    input,
  );
}

export function updateCustomerBankAccount(
  customerId: string,
  id: string,
  input: UpdateCustomerBankAccountInput,
): Promise<CustomerBankAccount> {
  return apiRequest<CustomerBankAccount>({
    url: `/api/v1/customers/${customerId}/bank-accounts/${id}`,
    method: 'PATCH',
    data: input,
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  });
}

export function deactivateCustomerBankAccount(
  customerId: string,
  id: string,
): Promise<void> {
  return apiRequest<void>({
    url: `/api/v1/customers/${customerId}/bank-accounts/${id}`,
    method: 'DELETE',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  });
}
```

- [x] **Step 5: Run the API tests and verify GREEN**

Run the same focused command. Expected: all existing customer API tests and the four new bank-account contract tests pass.

- [x] **Step 6: Commit the API slice**

```bash
git add apps/frontend/src/features/customers/types.ts apps/frontend/src/features/customers/api/customers-api.ts apps/frontend/src/features/customers/api/customers-api.spec.ts
git commit -m "feat(frontend): add customer bank account API client"
```

---

### Task 2: Add query and mutation hooks

**Files:**
- Modify: `apps/frontend/src/features/customers/api/use-customers.ts`
- Test: `apps/frontend/src/features/customers/api/customers-api.spec.ts`

**Interfaces:**
- Consumes Task 1's HTTP functions.
- Produces `useCustomerBankAccounts(customerId)`, `useCreateCustomerBankAccount(customerId)`, `useUpdateCustomerBankAccount(customerId)`, and `useDeactivateCustomerBankAccount(customerId)`.

- [x] **Step 1: Write the failing hook tests**

Add `renderHook` tests that resolve each mutation and spy on the `QueryClient`:

```typescript
it('invalidates the customer bank-account query after a successful update', async () => {
  apiRequest.mockResolvedValueOnce({ id: 'account-1', isActive: true });
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const invalidateQueries = vi
    .spyOn(queryClient, 'invalidateQueries')
    .mockResolvedValue();

  const { result } = renderHook(
    () => useUpdateCustomerBankAccount('customer-1'),
    { wrapper: createWrapper(queryClient) },
  );

  await result.current.mutateAsync({
    id: 'account-1',
    input: { isActive: true },
  });

  await waitFor(() => expect(invalidateQueries).toHaveBeenCalledWith({
    queryKey: ['customer-bank-accounts', 'customer-1'],
  }));
});
```

Add equivalent success invalidation assertions for create and deactivate. The query test must verify that an empty customer id disables the GET request, matching `useCustomer`.

- [x] **Step 2: Run the focused hook tests and verify RED**

Run:

```bash
pnpm --filter @casso-ledger/frontend test -- src/features/customers/api/customers-api.spec.ts
```

Expected: FAIL because the new hooks and query key are not exported.

- [x] **Step 3: Implement the customer-specific query key and hooks**

Add this key helper and hooks to `use-customers.ts`:

```typescript
export const customerBankAccountsKey = (customerId: string) =>
  ['customer-bank-accounts', customerId] as const;

export function useCustomerBankAccounts(customerId: string) {
  return useQuery({
    queryKey: customerBankAccountsKey(customerId),
    queryFn: () => fetchCustomerBankAccounts(customerId),
    enabled: customerId.length > 0,
  });
}

export function useCreateCustomerBankAccount(customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCustomerBankAccountInput) =>
      createCustomerBankAccount(customerId, input),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: customerBankAccountsKey(customerId),
      }),
  });
}

export function useUpdateCustomerBankAccount(customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: UpdateCustomerBankAccountInput;
    }) => updateCustomerBankAccount(customerId, id, input),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: customerBankAccountsKey(customerId),
      }),
  });
}

export function useDeactivateCustomerBankAccount(customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deactivateCustomerBankAccount(customerId, id),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: customerBankAccountsKey(customerId),
      }),
  });
}
```

Use `void` before the invalidation calls if the repository's lint configuration requires an explicitly ignored promise. Keep toasts and inline error copy in the UI components so form errors are not duplicated by global toasts.

- [x] **Step 4: Run the focused hook tests and verify GREEN**

Run the same focused command. Expected: all API and hook tests pass.

- [x] **Step 5: Commit the hook slice**

```bash
git add apps/frontend/src/features/customers/api/use-customers.ts apps/frontend/src/features/customers/api/customers-api.spec.ts
git commit -m "feat(frontend): add customer bank account query hooks"
```

---

### Task 3: Build the create/edit dialog

**Files:**
- Create: `apps/frontend/src/features/customers/components/customer-bank-account-dialog.tsx`
- Test: `apps/frontend/src/features/customers/components/customer-bank-account-dialog.spec.tsx`

**Interfaces:**
- Consumes Task 2's `useCreateCustomerBankAccount` and `useUpdateCustomerBankAccount` hooks plus `getApiErrorMessage` from `@/lib/api-client`.
- Produces `CustomerBankAccountDialog({ customerId, account, open, onOpenChange })`.

- [x] **Step 1: Write the failing dialog tests**

Cover these public behaviors:

```typescript
it('requires an account number when creating', async () => {
  renderCreateDialog();

  fireEvent.click(screen.getByRole('button', { name: 'Thêm tài khoản' }));
  fireEvent.click(screen.getByRole('button', { name: 'Thêm' }));

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Vui lòng nhập số tài khoản ngân hàng.',
  );
  expect(postWithIdempotency).not.toHaveBeenCalled();
});

it('keeps edit save disabled until a replacement is entered', async () => {
  renderEditDialog({ accountNumberMasked: '******2233' });

  expect(screen.getByRole('button', { name: 'Lưu thay đổi' })).toBeDisabled();
  expect(screen.getByText('******2233')).toBeInTheDocument();
});

it('shows the backend duplicate message inline', async () => {
  postWithIdempotency.mockRejectedValueOnce({
    response: {
      data: {
        errorCode: 'CONFLICT',
        message: 'Số tài khoản ngân hàng đã được liên kết.',
      },
    },
  });
  renderCreateDialog();

  fireEvent.change(screen.getByLabelText('Số tài khoản ngân hàng'), {
    target: { value: '0011 2233' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Thêm' }));

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Số tài khoản ngân hàng đã được liên kết.',
  );
});
```

Also verify that a successful create calls `postWithIdempotency` with the raw input only in the request and invokes `onOpenChange(false)`, while the rendered UI never displays a raw account response value.

- [x] **Step 2: Run the dialog tests and verify RED**

Run:

```bash
pnpm --filter @casso-ledger/frontend test -- src/features/customers/components/customer-bank-account-dialog.spec.tsx
```

Expected: FAIL because the dialog component does not exist.

- [x] **Step 3: Implement the dialog shell and form state**

Use the existing `Dialog`, `DialogContent`, `DialogHeader`, `DialogDescription`, `DialogFooter`, `DialogTitle`, `Input`, and `Button` components. The component must:

- accept `account?: CustomerBankAccount`; `undefined` means create mode;
- reset the input and inline error whenever it opens or the account changes;
- render `Thêm tài khoản ngân hàng`/`Sửa tài khoản ngân hàng` titles;
- show the existing mask in edit mode and keep the replacement input empty;
- set `type="text"`, `inputMode="numeric"`, and `autoComplete="off"` on the account input;
- treat `trim()` equal to `''` as invalid in create mode and as “no change” in edit mode;
- disable the submit button while the relevant mutation is pending or while edit has no replacement;
- pass `{ accountNumber: value }` to create/update after only removing leading/trailing whitespace for the request; do not implement backend normalization in the UI;
- use `getApiErrorMessage(error) ?? 'Không thể lưu tài khoản ngân hàng.'` for inline failures;
- close only from the success callback or explicit cancel/close interaction.

Use the exact submit labels `Thêm` and `Lưu thay đổi`; pending labels are `Đang thêm…` and `Đang lưu…`.

- [x] **Step 4: Run the dialog tests and verify GREEN**

Run the same focused command. Expected: all dialog tests pass.

- [x] **Step 5: Refactor only after the tests are green**

Keep the dialog self-contained. Do not extract a generic CRUD form or a new error abstraction for this one feature.

- [x] **Step 6: Commit the dialog slice**

```bash
git add apps/frontend/src/features/customers/components/customer-bank-account-dialog.tsx apps/frontend/src/features/customers/components/customer-bank-account-dialog.spec.tsx
git commit -m "feat(frontend): add customer bank account create edit dialog"
```

---

### Task 4: Build the list card and confirmation actions

**Files:**
- Create: `apps/frontend/src/features/customers/components/customer-bank-accounts-card.tsx`
- Test: `apps/frontend/src/features/customers/components/customer-bank-accounts-card.spec.tsx`

**Interfaces:**
- Consumes Task 2 hooks, Task 3 `CustomerBankAccountDialog`, `useAuth`, `hasPermission`, `Permission`, and existing shadcn card/badge/alert-dialog/button components.
- Produces `CustomerBankAccountsCard({ customerId })` for Task 5.

- [x] **Step 1: Write the failing card tests**

Cover these states and permissions:

```typescript
it('hides write controls for a read-only role', async () => {
  useAuthMock.mockReturnValue({ user: { role: Role.VIEWER } });
  apiRequest.mockResolvedValueOnce({
    items: [activeAccount],
    total: 1,
  });

  renderCard();

  expect(await screen.findByText('******2233')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /thêm tài khoản/i })).toBeNull();
  expect(screen.queryByRole('button', { name: /vô hiệu hóa/i })).toBeNull();
});

it('shows inactive status and a restore action', async () => {
  useAuthMock.mockReturnValue({ user: { role: Role.ACCOUNTANT } });
  apiRequest.mockResolvedValueOnce({
    items: [{ ...activeAccount, isActive: false }],
    total: 1,
  });

  renderCard();

  expect(await screen.findByText('Đã vô hiệu hóa')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /khôi phục/i })).toBeInTheDocument();
});

it('offers retry when the list request fails', async () => {
  useAuthMock.mockReturnValue({ user: { role: Role.VIEWER } });
  apiRequest.mockRejectedValueOnce(new Error('network'));
  renderCard();

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Không thể tải tài khoản ngân hàng.',
  );
  expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
});
```

Add interaction tests for the confirmation dialog: active `Vô hiệu hóa` calls DELETE only after confirmation; inactive `Khôi phục` calls PATCH with `{ isActive: true }` only after confirmation; cancel calls neither mutation. Add the empty-state assertion and verify `Thêm tài khoản` is present only for a managing role.

- [x] **Step 2: Run the card tests and verify RED**

Run:

```bash
pnpm --filter @casso-ledger/frontend test -- src/features/customers/components/customer-bank-accounts-card.spec.tsx
```

Expected: FAIL because the card component does not exist.

- [x] **Step 3: Implement the card list states**

Implement `CustomerBankAccountsCard({ customerId })` with:

- `useAuth()` and `hasPermission(user?.role ?? null, Permission.CUSTOMER_BANK_ACCOUNT_MANAGE)`;
- `useCustomerBankAccounts(customerId)`;
- a `CardHeader` titled `Tài khoản ngân hàng` and a manage-only `Thêm tài khoản` button;
- `role="status"` loading text `Đang tải tài khoản ngân hàng…`;
- `role="alert"` error text `Không thể tải tài khoản ngân hàng.` plus a `Thử lại` button calling `query.refetch()`;
- empty text `Khách hàng chưa có tài khoản ngân hàng nào.` and a manage-only add button;
- rows showing `accountNumberMasked`, a `Badge` with `Đang hoạt động` or `Đã vô hiệu hóa`, and manage-only row actions;
- stable, descriptive button names such as `Sửa ******2233`, `Vô hiệu hóa ******2233`, and `Khôi phục ******2233`.

Keep the list order from the API. Do not add client-side sorting, filtering, or pagination.

- [x] **Step 4: Implement controlled create/edit dialog state**

Keep the selected mode/account in the card:

```typescript
type DialogState =
  | { mode: 'create'; account?: undefined }
  | { mode: 'edit'; account: CustomerBankAccount };
```

Render one `CustomerBankAccountDialog` with `open={dialogState !== null}` and `onOpenChange` that clears the state when closed. Only authorized users can set a non-null dialog state.

- [x] **Step 5: Implement deactivation/reactivation confirmation**

Use one controlled `AlertDialog` state with `{ action: 'deactivate' | 'reactivate'; account: CustomerBankAccount }`. The dialog copy must distinguish the consequences:

- deactivate title: `Vô hiệu hóa tài khoản ngân hàng?`;
- deactivate description: `Tài khoản này sẽ không còn được dùng để tự động đối soát, nhưng vẫn được giữ trong lịch sử khách hàng.`;
- reactivate title: `Khôi phục tài khoản ngân hàng?`;
- reactivate description: `Tài khoản này sẽ được dùng lại để tự động đối soát sau khi khôi phục.`;
- cancel: `Hủy`;
- confirm: `Vô hiệu hóa` or `Khôi phục`.

While pending, disable both dialog actions and use `Đang xử lý…`. Deactivation calls `useDeactivateCustomerBankAccount(customerId).mutate(account.id)`. Reactivation calls `useUpdateCustomerBankAccount(customerId).mutate({ id: account.id, input: { isActive: true } })`. On success, close the dialog and show the corresponding success toast; on failure, close the dialog and show `Không thể cập nhật tài khoản ngân hàng.`.

- [x] **Step 6: Run the card tests and verify GREEN**

Run the same focused command. Expected: all list, RBAC, retry, empty-state, and confirmation tests pass.

- [x] **Step 7: Commit the card slice**

```bash
git add apps/frontend/src/features/customers/components/customer-bank-accounts-card.tsx apps/frontend/src/features/customers/components/customer-bank-accounts-card.spec.tsx
git commit -m "feat(frontend): add customer bank account management card"
```

---

### Task 5: Compose the card into customer detail and finish regression coverage

**Files:**
- Modify: `apps/frontend/src/features/customers/pages/customer-detail-page.tsx`
- Test: `apps/frontend/src/features/customers/pages/customer-detail-page.spec.tsx`

**Interfaces:**
- Consumes Task 4's `CustomerBankAccountsCard({ customerId })`.
- Produces the complete issue #234 customer-detail experience without moving bank-account business logic into the page.

- [ ] **Step 1: Write the failing detail-page assertion**

Extend the existing direct-route test fixture with a fifth `apiRequest` response for the bank-account list and assert that the card title and masked account appear:

```typescript
apiRequest.mockResolvedValueOnce({
  items: [
    {
      id: 'account-1',
      customerId: 'customer-1',
      accountNumberMasked: '******2233',
      isActive: true,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    },
  ],
  total: 1,
});

expect(await screen.findByText('Tài khoản ngân hàng')).toBeInTheDocument();
expect(screen.getByText('******2233')).toBeInTheDocument();
```

Add a no-raw-number assertion to ensure the page never renders a full account value.

- [ ] **Step 2: Run the detail-page test and verify RED**

Run:

```bash
pnpm --filter @casso-ledger/frontend test -- src/features/customers/pages/customer-detail-page.spec.tsx
```

Expected: FAIL because the page does not render `CustomerBankAccountsCard` or request its data.

- [ ] **Step 3: Place the card in the page**

Import `CustomerBankAccountsCard` and render:

```tsx
<CustomerBankAccountsCard customerId={id} />
```

Place it after the existing contact/payment-term grid and before the activity timeline. Do not add customer bank-account hooks, permissions, mutations, or dialogs directly to `CustomerDetailPage`.

- [ ] **Step 4: Run the focused customer feature suite and verify GREEN**

Run:

```bash
pnpm --filter @casso-ledger/frontend test -- src/features/customers
```

Expected: all customer API, hook, dialog, card, customer-table, timeline, allocation, and detail-page tests pass.

- [ ] **Step 5: Run type-check and repository verification**

Run:

```bash
pnpm --filter @casso-ledger/frontend type-check
pnpm verify
```

Expected: both commands exit 0. If the native optional `cpu-features` install warning appears again, it must not be treated as a verification failure when `pnpm install` exits 0; report it separately if it affects the local environment.

- [ ] **Step 6: Commit the page integration**

```bash
git add apps/frontend/src/features/customers/pages/customer-detail-page.tsx apps/frontend/src/features/customers/pages/customer-detail-page.spec.tsx
git commit -m "feat(frontend): integrate customer bank accounts into detail page"
```

---

## Verification checklist

Before handing off the implementation:

- [ ] `pnpm --filter @casso-ledger/frontend test -- src/features/customers` passes.
- [ ] `pnpm --filter @casso-ledger/frontend type-check` passes.
- [ ] `pnpm verify` passes.
- [ ] The card is visible to read-only users but all write controls are hidden.
- [ ] Active and inactive rows remain visible after query invalidation.
- [ ] Deactivation uses `DELETE`; reactivation uses `PATCH { isActive: true }`.
- [ ] Edit cannot submit an empty replacement.
- [ ] No raw account number is rendered, copied, logged, or persisted by frontend code.
- [ ] No backend/API/domain/migration files changed.
