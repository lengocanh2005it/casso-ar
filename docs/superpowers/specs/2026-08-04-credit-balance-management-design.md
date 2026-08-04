# Credit Balance Management Design

**Date:** 2026-08-04  
**Status:** Proposed  
**Scope:** Backend read API and existing payment-allocation integration; no new FE screen

## 1. Goal

Make customer credit balances usable after an overpayment: accountants can see all unapplied amounts belonging to a customer and apply them to a later receivable through the existing payment-allocation flow.

The feature keeps `Payment` as the only source of truth. It does not introduce a `CustomerCreditBalance` table, a duplicated rollup, or a separate credit ledger.

## 2. Existing model and boundary

The Domain Core model already defines:

- `Payment.customerId`, nullable for payments whose customer is not known yet.
- `Payment.totalAmount` and persisted `Payment.allocatedAmount`.
- Derived `Payment.unallocatedAmount = totalAmount - allocatedAmount`.
- `PaymentAllocation` as the source of truth for allocation history.
- Atomic allocation/undo transactions that update both Payment and Receivable rollups.

The Exception Queue plan already creates a customer-attributed Payment when an accountant uses `mark-prepaid`. Matching and manual matching also preserve the resolved `customerId` on Payment.

This design owns:

- A customer-scoped read API for positive unallocated balances.
- The query/repository contract needed to read those balances efficiently.
- Validation that `mark-prepaid` attributes the Payment to a customer in the current tenant.
- Contract tests proving allocation and undo automatically change the visible balance.

This design does not own:

- A new balance table or customer credit ledger.
- Manual balance adjustment, credit expiry, refund, write-off, or transfer between customers.
- A new allocation endpoint. Existing `POST /payments/:id/allocate` remains the single write path.
- A new undo endpoint. Existing `POST /payments/allocations/:allocationId/undo` remains the single undo path.
- A new FE screen.

## 3. Source of truth and invariants

A credit item is an existing `Payment` satisfying all conditions below in the current organization:

```text
Payment.customerId IS NOT NULL
Payment.totalAmount > Payment.allocatedAmount
Payment.totalAmount >= 0
Payment.allocatedAmount >= 0
```

The available customer balance is:

```text
totalAvailableAmount = SUM(Payment.totalAmount - Payment.allocatedAmount)
```

The query must use the persisted `totalAmount`/`allocatedAmount` rollups; it must not aggregate `PaymentAllocation` rows at read time. Active allocation and undo transactions are responsible for keeping those rollups correct.

Required invariants:

1. A credit Payment always has a non-null `customerId` before it can be allocated.
2. A credit can only be allocated to a `Receivable` with the same `customerId`.
3. Allocation amount is a positive integer and cannot exceed either the Payment's current `unallocatedAmount` or the Receivable's current `remainingAmount`.
4. Allocation and undo run through the existing transaction/lock path. No credit-specific code updates `allocatedAmount` directly.
5. A fully allocated Payment disappears from the credit list automatically.
6. Undoing an allocation increases the same Payment's `unallocatedAmount` and makes it visible again automatically.
7. All Payment, Customer, and Receivable queries are tenant-scoped. `organizationId` is never accepted from a request body or used as a customer selector.

## 4. Read API

### 4.1 List a customer's available credits

```http
GET /customers/:customerId/credits
```

The existing global `/api/v1` prefix applies, so the public path is `/api/v1/customers/:customerId/credits`.

Permission: `RECEIVABLE_READ`.

The service first resolves `customerId` through the tenant-scoped Customer repository. A missing or cross-tenant customer returns `404`.

Response `200`:

```json
{
  "customerId": "cust-1",
  "totalAvailableAmount": 5000000,
  "items": [
    {
      "paymentId": "pay-2",
      "bankTransactionId": "bt-2",
      "totalAmount": 25000000,
      "allocatedAmount": 20000000,
      "unallocatedAmount": 5000000,
      "payerName": "Công ty B",
      "receivedAt": "2026-08-04T10:00:00.000Z",
      "createdAt": "2026-08-04T10:00:01.000Z"
    }
  ]
}
```

Rules:

- Return only rows with `unallocatedAmount > 0`.
- Include partially allocated Payments and `mark-prepaid` Payments with zero allocations.
- Exclude Payments whose `customerId` is null.
- Sort items by `receivedAt ASC`, then `paymentId ASC` for deterministic oldest-credit-first display.
- Return integer amounts in đồng; never use floating point.
- No pagination in MVP; the endpoint is customer-scoped and the product has no credit-history pagination requirement yet.
- The response contains IDs and payment metadata only; it does not expose bank credentials, webhook raw payloads, or any secret.

An empty balance is a valid response:

```json
{
  "customerId": "cust-1",
  "totalAvailableAmount": 0,
  "items": []
}
```

## 5. Reuse existing allocation and undo APIs

### 5.1 Apply a credit

Use the existing endpoint:

```http
POST /payments/:id/allocate
Content-Type: application/json

{
  "receivableId": "rec-2",
  "amount": 5000000
}
```

Permission: existing `PAYMENT_ALLOCATE`.

The existing `AllocatePaymentUseCase` remains the only write path. It must accept a Payment with `customerId != null` and enforce:

- Payment belongs to the current tenant.
- Receivable belongs to the current tenant.
- `Payment.customerId === Receivable.customerId`.
- Payment is not already fully allocated.
- Amount is a positive integer and fits both current balances.
- Payment rollup, Receivable rollup, PaymentAllocation, status transitions, and audit are committed atomically.

The response contract stays the existing `{ success: true, paymentId }`; no credit-specific response shape is introduced.

### 5.2 Undo an applied credit

Use the existing endpoint:

```http
POST /payments/allocations/:allocationId/undo
Content-Type: application/json

{ "reason": "Applied to wrong invoice" }
```

Permission: existing `PAYMENT_ALLOCATE_UNDO`.

The existing undo transaction soft-deletes the allocation, reduces `Receivable.paidAmount`, increases `Payment.unallocatedAmount`, and records the existing `PAYMENT_ALLOCATE_UNDO` audit entry. No credit-specific undo operation is added.

## 6. Mark-prepaid integration

`POST /bank-transactions/:id/mark-prepaid` remains the way an accountant assigns an unmatched bank transaction to a customer before an invoice is known.

Its existing use case must additionally resolve `customerId` through the tenant-scoped Customer repository before creating the Payment. A customer from another organization must be indistinguishable from a missing customer and return `404`.

On success:

```text
Payment.customerId = selected customer
Payment.totalAmount = BankTransaction.amount
Payment.allocatedAmount = 0
Payment.unallocatedAmount = BankTransaction.amount
```

The new credits endpoint shows that Payment immediately after the transaction commits. The existing `BANK_TRANSACTION_MARK_PREPAID` audit action remains sufficient; no new audit action is added.

## 7. Application and repository boundaries

Extend the existing Payments read port rather than creating a parallel Credit repository:

```typescript
export interface CustomerCreditRow {
  payment: Payment;
  unallocatedAmount: number;
}

export interface IPaymentRepository {
  findById(id: string): Promise<Payment | null>;
  findUnallocatedByCustomerId(customerId: string): Promise<CustomerCreditRow[]>;
  save(payment: Payment, manager?: EntityManager): Promise<void>;
}
```

`findUnallocatedByCustomerId` must:

- Use `BaseRepository`/`TenantContextService`.
- Query `customerId = :customerId AND totalAmount > allocatedAmount`.
- Map `unallocatedAmount` as `totalAmount - allocatedAmount`.
- Order by `receivedAt ASC, id ASC`.
- Never accept `organizationId` from the caller.

Add `GetCustomerCreditsUseCase` in the Payments module. It validates the customer through `ICustomerRepository.findById`, calls the payment read port, sums the returned integer amounts, and maps the response without changing Payment state.

The controller is a read-only adapter:

```typescript
@Controller('customers/:customerId/credits')
export class CustomerCreditsController {
  @Get()
  @RequirePermission(Permission.RECEIVABLE_READ)
  async list(@Param('customerId') customerId: string) {
    return this.getCustomerCreditsUseCase.execute({ customerId });
  }
}
```

Do not add a `CreditBalance` domain entity, a `CustomerCreditBalanceOrmEntity`, or a second payment allocation use case.

## 8. Validation and errors

| Condition | HTTP result |
|---|---:|
| Customer is missing or belongs to another tenant | `404` |
| Payment is missing or belongs to another tenant | `404` |
| Receivable is missing or belongs to another tenant | `404` |
| Payment has no `customerId` | `400` |
| Payment customer differs from Receivable customer | `400` |
| Amount is zero, negative, non-integer, or too large | `400` |
| Concurrent allocation finds a changed rollup | existing allocation conflict (`409`) |
| Role lacks read/allocate permission | `403` |

The API must not reveal whether a resource exists in another organization.

## 9. Testing and acceptance criteria

Unit tests must prove:

- multiple partial credit Payments aggregate into one customer total;
- fully allocated Payments are excluded;
- `customerId = null` Payments are excluded;
- results are ordered deterministically;
- `GetCustomerCreditsUseCase` rejects a missing customer and never accepts an organization ID input;
- allocation rejects a different customer and an amount above `unallocatedAmount`;
- undo makes the previously allocated amount available again.

Integration tests must prove:

- `mark-prepaid` creates a Payment visible from `GET /customers/:customerId/credits`;
- cross-tenant customer/payment/receivable access returns `404`;
- a credit allocation reduces `totalAvailableAmount` and the item amount atomically;
- a full allocation removes the item from the list;
- undo restores the item/amount and preserves the allocation history;
- concurrent allocation cannot spend the same unallocated amount twice;
- `RECEIVABLE_READ`, `PAYMENT_ALLOCATE`, and `PAYMENT_ALLOCATE_UNDO` permissions remain enforced.

Acceptance is complete when the customer credit read API is backed only by Payment rollups, existing allocation/undo paths handle the write lifecycle, and no second balance source exists.

## 10. Out of scope and follow-ups

- Separate credit ledger or journal entries.
- Credit expiration, manual adjustment, write-off, refund, or customer-to-customer transfer.
- Credit reservation before allocation.
- Pagination/export/report-specific credit views.
- FE credit-balance UI.
