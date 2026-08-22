# Customer Bank Account Management UI Design

> Fixes [issue #234](https://github.com/lengocanh2005it/casso-ledger/issues/234). Frontend follow-up to the already-shipped Customer Bank Account Management backend API.

**Date:** 2026-08-22
**Status:** Proposed
**Scope:** Frontend customer-detail UI only; no backend, database, or permission changes

## 1. Goal

Give a business user a clear, tenant-safe UI on the customer detail page to inspect, add, edit, deactivate, and reactivate the bank-account mappings used by automatic bank-transaction matching.

## 2. Problem and boundary

The backend already exposes the complete customer bank-account management contract:

- `GET /api/v1/customers/:customerId/bank-accounts` — list, `RECEIVABLE_READ`.
- `POST /api/v1/customers/:customerId/bank-accounts` — create, `CUSTOMER_BANK_ACCOUNT_MANAGE`.
- `PATCH /api/v1/customers/:customerId/bank-accounts/:id` — update or reactivate, `CUSTOMER_BANK_ACCOUNT_MANAGE`.
- `DELETE /api/v1/customers/:customerId/bank-accounts/:id` — soft-deactivate, `CUSTOMER_BANK_ACCOUNT_MANAGE`.

The missing piece is the frontend surface. This design does not change the backend contract, the Matching Engine, customer ownership, or bank-connection/OAuth management.

## 3. Settled decisions

These decisions were confirmed during grilling for issue #234:

| Area | Decision |
|---|---|
| Placement | Add a `Tài khoản ngân hàng` card to the customer detail page, after the contact/payment-term cards and before the activity timeline. |
| Read access | Render the card and list for users who can view the customer. The list endpoint's existing `RECEIVABLE_READ` permission remains authoritative. |
| Write access | Hide every management control unless `hasPermission(user?.role ?? null, Permission.CUSTOMER_BANK_ACCOUNT_MANAGE)` is true. Do not render disabled write buttons. |
| Active rows | Show the masked account number, active status, and `Sửa`/`Vô hiệu hóa` actions to authorized users. |
| Inactive rows | Keep inactive rows visible, show the inactive status, and offer `Sửa` plus a separate `Khôi phục` action to authorized users. |
| Delete semantics | Use the existing `DELETE` endpoint but label the action `Vô hiệu hóa`; it is a soft deactivation, not hard deletion. |
| Confirmation | Require an `AlertDialog` confirmation for both deactivation and reactivation. |
| Forms | Use a dialog for create and edit. The edit dialog changes only the account number; activation is a separate action. |
| Sensitive data | Display only `accountNumberMasked`; never reveal, copy, or prefill the raw account number. |
| Input | Use a text input with `inputMode="numeric"`. The create form requires a non-empty value. The edit form accepts an optional replacement and disables save when no replacement is entered. Spaces and hyphens are allowed for backend normalization. |
| List shape | Preserve backend `createdAt DESC` order. No search, pagination, or bulk action. |
| Empty/error states | Show an explanatory empty state, a loading state, and an error state with `Thử lại`. The add action appears in the empty state only for authorized users. |
| Error handling | Use backend Vietnamese messages when present; use a generic fallback for unknown errors. Keep `errorCode` available for branching, especially duplicate-account conflicts. |

## 4. User flows

### 4.1 View mappings

On `/customers/:id`, the page requests the customer bank-account list independently of the customer profile request. The card renders:

- loading text with `role="status"` while the request is pending;
- an error message with `role="alert"` and a retry button if the request fails;
- an empty message when `items` is empty;
- one accessible row per mapping otherwise.

Each row shows:

- the masked value from `accountNumberMasked`;
- `Đang hoạt động` or `Đã vô hiệu hóa`;
- `Sửa` plus `Vô hiệu hóa` for active rows when authorized;
- `Sửa` plus `Khôi phục` for inactive rows when authorized.

The UI must not infer activity from the mask or from dates; it uses `isActive` from the API.

### 4.2 Add mapping

1. The user with `CUSTOMER_BANK_ACCOUNT_MANAGE` clicks `Thêm tài khoản`.
2. The dialog opens with an empty `Số tài khoản ngân hàng` text input.
3. An empty or whitespace-only value is rejected locally with an inline message.
4. A valid non-empty value is sent to `POST` through `postWithIdempotency`.
5. On success, the dialog closes, the list query is invalidated, and a success toast is shown.
6. On failure, the dialog stays open and shows the backend message or a generic fallback inline.

If the server returns a duplicate conflict, the inline message explains that the mapping already exists and that an inactive row should be restored instead of creating a duplicate.

### 4.3 Edit mapping

1. The user clicks `Sửa`.
2. The dialog shows the existing masked value as context and an empty optional replacement input.
3. The save action is disabled until a replacement value is entered.
4. The replacement is sent to `PATCH` as `{ accountNumber }`; the UI never sends `customerId` or `isActive` from this form.
5. On success, the dialog closes, the list refreshes, and a success toast is shown.
6. On failure, the dialog stays open and shows the backend message or a generic fallback inline.

### 4.4 Deactivate mapping

1. The user clicks `Vô hiệu hóa` on an active row.
2. An `AlertDialog` explains that the mapping will stop participating in automatic matching while remaining in the customer's history.
3. Confirming sends `DELETE` with an idempotency key.
4. On success, the list refreshes and the row becomes inactive; a success toast is shown.
5. On failure, the dialog closes only if the action succeeded; otherwise a generic error toast is shown.

### 4.5 Reactivate mapping

1. The user clicks `Khôi phục` on an inactive row.
2. An `AlertDialog` explains that the mapping will become eligible for matching again after the update succeeds.
3. Confirming sends `PATCH` with `{ isActive: true }`.
4. On success, the list refreshes and the row becomes active; a success toast is shown.
5. On failure, the row remains inactive and a generic error toast is shown.

## 5. Frontend architecture

Reuse the existing customer feature boundaries:

- `features/customers/types.ts` owns the response/input interfaces used by the feature.
- `features/customers/api/customers-api.ts` owns HTTP functions and idempotency headers.
- `features/customers/api/use-customers.ts` owns TanStack Query keys, queries, mutations, and invalidation.
- `features/customers/components/customer-bank-accounts-card.tsx` owns list states, permission-gated row actions, and confirmation dialogs.
- `features/customers/components/customer-bank-account-dialog.tsx` owns create/edit form state and inline errors.
- `features/customers/pages/customer-detail-page.tsx` only places the card; it does not own bank-account business logic.

No new package, cache, route, shared abstraction, or backend endpoint is needed.

## 6. API contract consumed by the UI

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

The frontend functions use these exact request shapes:

```text
GET    /api/v1/customers/:customerId/bank-accounts
POST   /api/v1/customers/:customerId/bank-accounts
       { accountNumber }
PATCH  /api/v1/customers/:customerId/bank-accounts/:id
       { accountNumber } | { isActive: true }
DELETE /api/v1/customers/:customerId/bank-accounts/:id
```

`POST`, `PATCH`, and `DELETE` carry an `Idempotency-Key: crypto.randomUUID()` header. `DELETE` is typed as `Promise<void>` because the backend returns `204 No Content`.

## 7. Accessibility and UI rules

- Every form input has a visible label and a stable accessible name.
- Loading and error messages use the existing `role="status"`/`role="alert"` pattern.
- Management buttons have labels that include the masked account when row context is otherwise ambiguous.
- Confirmation dialogs have a clear title, consequence description, cancel action, and pending-state action.
- Mutation buttons are disabled while their mutation is pending to prevent duplicate requests.
- Use existing shadcn `Card`, `Badge`, `Dialog`, `AlertDialog`, `Input`, and `Button` components; do not add a new UI primitive.

## 8. Testing and acceptance criteria

The implementation is accepted when:

1. API tests verify exact URL/method/payload behavior and idempotency headers for list/create/update/deactivate.
2. Hook tests verify that successful create/update/deactivate/reactivate mutations invalidate `['customer-bank-accounts', customerId]`.
3. Dialog tests verify required create input, edit save disabled with no replacement, successful create/edit, and inline backend error display.
4. Card tests verify loading, error+retry, empty state, active/inactive rows, confirmation actions, and hidden write controls for a role without `CUSTOMER_BANK_ACCOUNT_MANAGE`.
5. Customer detail tests verify the card is rendered and its bank-account query is part of the page's normal detail flow.
6. The frontend type check and `pnpm verify` pass.

## 9. Out of scope

- Backend/API/domain/migration changes.
- Search, pagination, sorting controls, or bulk operations.
- Revealing or copying the full account number.
- Moving a mapping between customers.
- Bank name, account-holder name, primary-account selection, verification, or import.
- Changes to Matching Engine behavior, tenant isolation, or backend RBAC.
