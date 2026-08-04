# Domain Core Design — Customer, Invoice, Receivable, Payment, PaymentAllocation

> Child spec of [docs/overview.md](../../../docs/overview.md). Defines the entities, relationships, state machine, and business rules for the core domain used by Matching Engine, Reminder, and Reporting.

## 1. Scope & objectives

This spec covers only five entities: `Customer`, `Invoice`, `Receivable`, `Payment`, and `PaymentAllocation`. The goal is implementation-ready clarity: an exact ERD, the `Receivable` state machine, and the business rules for payment allocation.

Out of scope (see section 6):
- How `BankTransaction` creates `Payment` (separate Matching Engine spec).
- Reminder/notification logic based on overdue or dispute status (separate Reminder spec).
- `Organization`, `Membership`, `Role`, and RBAC (separate Multi-tenancy spec).

Baseline assumption: every entity below has `organizationId` (tenant isolation), which is not repeated for each entity.

## 2. Entities & ERD

```
Customer
  id, organizationId, name, taxCode, email, phone,
  defaultPaymentTermDays, creditLimit, priority, createdAt

Invoice
  id, organizationId, customerId, invoiceNumber, issueDate,
  totalAmount, taxAmount, sourceType (MANUAL/IMPORT/API/ERP),
  fileUrl, status (DRAFT/ISSUED/CANCELLED), createdAt

Receivable
  id, organizationId, customerId, invoiceId (nullable),
  originalAmount,
  paidAmount            -- persisted rollup, updated with every allocation/undo transaction
  remainingAmount        -- derived, = originalAmount - paidAmount
  isDisputed             -- computed, = EXISTS(Dispute WHERE receivableId=this.id AND status='OPEN')
                          --   see 2026-08-03-dispute-management-design.md
  dueDate, status,
  salesRepresentativeId (nullable), createdAt, closedAt

Payment
  id, organizationId, customerId (nullable), bankTransactionId (nullable),
  totalAmount,
  allocatedAmount        -- persisted rollup, maintained from active PaymentAllocation rows
  unallocatedAmount      -- derived, = totalAmount - allocatedAmount
  payerName, receivedAt, createdAt

PaymentAllocation
  id, organizationId, paymentId, receivableId,
  allocatedAmount, allocatedAt, allocatedByUserId (nullable, null = auto-match),
  deletedAt (nullable), deletedByUserId (nullable), undoReason (nullable), createdAt
```

Relationships:

```
Customer 1──N Invoice
Customer 1──N Receivable
Invoice   1──N Receivable      (an invoice may be split into multiple receivables, for example by installment term)
Receivable 0..1──1 Invoice     (a receivable may exist before an invoice)
Payment   1──N PaymentAllocation
Receivable 1──N PaymentAllocation
```

`paidAmount` (on `Receivable`) and `allocatedAmount` (on `Payment`) are **persisted rollups**, stored so queries/reporting do not aggregate every allocation. `remainingAmount` and `unallocatedAmount` are derived fields. `PaymentAllocation` remains the source of truth for history and must be written with the rollups in one locked transaction; rollups must not be updated through a separate path.

Required DB and application invariants: `0 <= paidAmount <= originalAmount`, `0 <= allocatedAmount <= totalAmount`, all input allocation amounts are positive integers (and rollups are non-negative integers), and every allocation/undo updates both rollups in the same transaction. Business FKs must share `organizationId`, and tenant columns must be `NOT NULL`/indexed according to the Multi-tenancy spec.

## 3. Receivable—status & transitions

### Status values

```
DRAFT
OPEN
PARTIALLY_PAID
PAID
DISPUTED (not a separate status—see the "isDisputed flag" below)
WRITTEN_OFF
CANCELLED
```

`OVERDUE` is **not a status stored in the database**. Compute it at runtime:
```
isOverdue = status IN (OPEN, PARTIALLY_PAID) AND dueDate < today
```
Reason: avoid a two-way state machine (OPEN → OVERDUE → OPEN when an extension is granted) and a dedicated cron job merely to update a flag that can be computed at query time.

`isDisputed` is a **computed flag independent** of the primary status (see the `Dispute` entity in [2026-08-03-dispute-management-design.md](2026-08-03-dispute-management-design.md)). It is not a separate status and is not stored directly on `Receivable`. When disputed, reminders pause, but `status` remains `OPEN`/`PARTIALLY_PAID` and payment/matching continue normally.

### Transition diagram

```
DRAFT ────────────► OPEN ────────────► PARTIALLY_PAID ────────────► PAID
                      │                       │
                      │                       └──────► WRITTEN_OFF
                      ├──────► WRITTEN_OFF
                      └──────► CANCELLED (only when paidAmount == 0)
```

### Transition rules

| From | To | Condition |
|---|---|---|
| DRAFT | OPEN | Receivable is activated (for example, invoice issued) |
| OPEN | PARTIALLY_PAID | `0 < paidAmount < originalAmount` |
| PARTIALLY_PAID | PAID | `remainingAmount == 0` |
| OPEN | PAID | `remainingAmount == 0` (paid in full immediately; does not need to pass through PARTIALLY_PAID) |
| OPEN | WRITTEN_OFF | Manual action. `remainingAmount > 0`; keep `paidAmount` unchanged (accept the remaining loss) |
| PARTIALLY_PAID | WRITTEN_OFF | Same as above |
| OPEN | CANCELLED | Manual action. **Valid only when `paidAmount == 0`** |
| PARTIALLY_PAID | CANCELLED | **Invalid**—once money has been received, it cannot be "cancelled as if it never existed"; use `WRITTEN_OFF` |

`PAID`, `WRITTEN_OFF`, and `CANCELLED` are **terminal states**: no new `PaymentAllocation` may be created and no `ReminderSchedule` continues running.

The accounting meanings of the two easily confused terminal states:
- **WRITTEN_OFF** = accept the loss—only applies in `OPEN`/`PARTIALLY_PAID` with `remainingAmount > 0`.
- **CANCELLED** = cancel the obligation from the start as if it never arose—valid only when no payment has ever been received.

## 4. Payment & PaymentAllocation—business rules

1. A `Payment` may be allocated to N `Receivable` records, but **only for the same Customer**. `Payment.customerId` must be resolved before auto/manual allocation; if it is still `null` or belongs to another customer, direct allocation is forbidden and the payment must go through the Exception Queue.
2. A `Receivable` may receive N `PaymentAllocation` records from N different `Payment` records (a customer may pay an invoice in multiple installments).
3. `allocatedAmount` may not exceed the receivable's `remainingAmount` at allocation time. Checking and writing the allocation must be in the same locked transaction (preventing two accountants from exceeding the balance concurrently; see Optimistic Locking in section 15 of the original document).
4. `unallocatedAmount = totalAmount - Payment.allocatedAmount` is always `>= 0`. If money remains after all relevant receivables are allocated (`unallocatedAmount > 0`), **do not automatically apply it to another receivable**. Keep it as the customer's "credit balance", shown in the Exception Queue/customer detail so accounting can allocate it to the next receivable intentionally.
5. `allocatedAmount` must be a positive integer (`Number.isInteger(amount) && amount > 0`) in the application and `CHECK (allocatedAmount > 0)` in the database; decimals, zero, and negative values are rejected.
6. Undoing a `PaymentAllocation` is not a hard delete: lock the allocation, payment, and receivable; set `deletedAt`, `deletedByUserId`, and `undoReason`; and write an INSERT-only `AuditLog` with before/after state and actor. Only active allocations (`deletedAt IS NULL`) can be undone; rollup queries count active allocations only.
7. Undo must be atomic: soft-delete, audit, and updates to `Receivable.paidAmount`, `Payment.allocatedAmount`, and `Receivable.status` occur in the same DB transaction. Allow `PAID → PARTIALLY_PAID`/`OPEN` based on the new rollups; do not restore `CANCELLED`/`WRITTEN_OFF` to a payment state.
8. Creating or undoing an allocation must be atomic: `remainingAmount`/`unallocatedAmount` are always read from rollups after the transaction commits.

## 5. Example

```
Invoice INV-2026-0012: 50.000.000 VND, due 20/08/2026
→ Receivable R1 (status OPEN, originalAmount 50.000.000)

Payment P1: 30.000.000 (payerName "Company B")
  → PaymentAllocation: P1 → R1, 30.000.000
  → R1.paidAmount = 30.000.000, remainingAmount = 20.000.000
  → R1.status = PARTIALLY_PAID

Payment P2: 25.000.000
  → PaymentAllocation: P2 → R1, 20.000.000 (only the remaining amount)
  → P2.unallocatedAmount = 5.000.000 → kept as Company B's credit balance
  → R1.paidAmount = 50.000.000, remainingAmount = 0
  → R1.status = PAID (terminal; cancel remaining reminders and send a confirmation email)
```

Undo allocation P2:
```
→ lock P2→R1 and the active allocation
→ set PaymentAllocation.deletedAt/deletedByUserId/undoReason, preserving the history row
→ decrease P2.allocatedAmount and R1.paidAmount in the same transaction
→ record AuditLog(action=PAYMENT_ALLOCATE_UNDO, entity=PaymentAllocation)
→ R1.status = PARTIALLY_PAID; P2.unallocatedAmount increases by 20.000.000
```

## 6. Out of scope

- How `BankTransaction` creates `Payment` and selects a `Receivable` candidate—see the Matching Engine spec (the next spec).
- Reminder/notification logic based on `isOverdue`/`isDisputed`—see the Reminder spec.
- `Organization`, `Membership`, `Role`, and RBAC—see the Multi-tenancy spec.

## 7. Open questions (do not block implementation)

- Which actor/flow performs the `DRAFT → OPEN` transition when a receivable is recorded before the official invoice exists?
- Does `WRITTEN_OFF` require an approval role (Finance Manager), or may an Accountant perform it directly?
