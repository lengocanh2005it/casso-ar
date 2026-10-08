# Collection Activity Timeline Design

> Child spec of [docs/overview.md](../../../docs/overview.md) (section 7.13), dependent on [2026-08-03-domain-core-design.md](2026-08-03-domain-core-design.md), [2026-08-03-reminder-automation-design.md](2026-08-03-reminder-automation-design.md), and [2026-08-03-dispute-management-design.md](2026-08-03-dispute-management-design.md).

## 1. Entity

```
CollectionActivity
  id, organizationId, receivableId, customerId,
  activityType (INVOICE_CREATED/EMAIL_SENT/EMAIL_FAILED/PAYMENT_RECEIVED/
                ALLOCATION_UNDONE/RECEIVABLE_CLOSED/DISPUTE_OPENED/DISPUTE_RESOLVED/
                MANUAL_CALL/MANUAL_NOTE/PAYMENT_COMMITMENT),
  description, metadata (jsonb), createdByUserId (nullable — null = recorded automatically by the system),
  createdAt
```

`CollectionActivity` is a display record (a denormalized log for the timeline), **not the source of truth**—the actual business state remains in `ReminderExecution`/`PaymentAllocation`/`Dispute`. It aggregates records for display without UNIONing multiple source tables on every page load.

## 2. Data write sources

### 2.1. Domain event listener (automatic)

```
ReminderExecution created (status=SENT/FAILED)  → activityType EMAIL_SENT / EMAIL_FAILED
PaymentAllocation created                       → activityType PAYMENT_RECEIVED
Active PaymentAllocation undone                 → activityType ALLOCATION_UNDONE
Receivable.status → PAID                        → activityType RECEIVABLE_CLOSED
Dispute created / resolved                      → activityType DISPUTE_OPENED / DISPUTE_RESOLVED
```

Use an internal event emitter (NestJS `EventEmitter2` or equivalent): source services (`PaymentAllocationService`, `ReminderService`, `DisputeService`) only **emit events after a successful transaction**; they do not scatter `CollectionActivity` writes across each service. A single listener listens and writes to `CollectionActivity`. An asynchronous listener must establish `TenantContext` from `organizationId` in the payload before looking up `customerId` or inserting the activity.

### 2.2. Manual API (entered by accounting/sales)

```
POST /receivables/:id/activities
  body: { activityType: MANUAL_CALL | MANUAL_NOTE | PAYMENT_COMMITMENT, description }
  createdByUserId = current user
```

Use this for events with no other system source—"an employee called" or "the customer committed to a payment date" (section 7.13 of the original document).

## 3. Read API

```
GET /customers/:id/timeline   → CollectionActivity for every Receivable belonging to the customer, ordered by createdAt DESC
GET /receivables/:id/timeline → CollectionActivity for that receivable only
```

## 4. Out of scope

- Detailed timeline UI (described in section 18 of the original document, Receivable Detail).
- Editing/deleting recorded `CollectionActivity`—INSERT only, with no PATCH/DELETE endpoint (following the immutability principle of `AuditLog`).

## 5. Open questions (do not block implementation)

- Do `MANUAL_NOTE`/`MANUAL_CALL` need a separate "call outcome" field (contacted/not contacted), or is free-form `description` enough?
- Should the event listener run synchronously in the same transaction or asynchronously through a separate queue (determining whether `CollectionActivity` is immediately consistent with the source table or has a small delay)?

## 6. Allocation undo (issue #425)

A successfully committed allocation undo appends a distinct `ALLOCATION_UNDONE` activity for the same receivable and customer. The original `PAYMENT_RECEIVED` activity remains unchanged because the payment was received even though its allocation was later reversed. Store `allocationId`, `paymentId`, the positive amount undone, and `undoReason` in metadata; set `createdByUserId` to the user who performed the undo. The timeline label is “Hoàn tác phân bổ”; its description includes the undone amount and reason, visible to anyone who can read that timeline.

The undo use case emits `payment.allocation-undone` only after its database transaction commits. Its listener uses the existing failure-contained, fire-and-forget pattern: a listener or insert failure is logged and swallowed, so it cannot fail the financial undo. This is best-effort timeline projection; it does not guarantee eventual delivery after a process failure. Replaying the same `Idempotency-Key` with the same input returns the stored success, while a new key for an already-undone allocation returns `ALLOCATION_ALREADY_UNDONE`; neither replay creates another activity.

Implementation must add the `ALLOCATION_UNDONE` Postgres enum value through a production migration and give the frontend type a user-facing label. Regression coverage verifies that the receivable timeline contains both the original allocation and its undo, while rollback and duplicate attempts add no undo activity.
