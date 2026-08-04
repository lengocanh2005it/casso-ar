# Collection Activity Timeline Design

> Child spec of [docs/overview.md](../../../docs/overview.md) (section 7.13), dependent on [2026-08-03-domain-core-design.md](2026-08-03-domain-core-design.md), [2026-08-03-reminder-automation-design.md](2026-08-03-reminder-automation-design.md), and [2026-08-03-dispute-management-design.md](2026-08-03-dispute-management-design.md).

## 1. Entity

```
CollectionActivity
  id, organizationId, receivableId, customerId,
  activityType (INVOICE_CREATED/EMAIL_SENT/EMAIL_FAILED/PAYMENT_RECEIVED/
                RECEIVABLE_CLOSED/DISPUTE_OPENED/DISPUTE_RESOLVED/MANUAL_CALL/
                MANUAL_NOTE/PAYMENT_COMMITMENT),
  description, metadata (jsonb), createdByUserId (nullable — null = recorded automatically by the system),
  createdAt
```

`CollectionActivity` is a display record (a denormalized log for the timeline), **not the source of truth**—the actual business state remains in `ReminderExecution`/`PaymentAllocation`/`Dispute`. It aggregates records for display without UNIONing multiple source tables on every page load.

## 2. Data write sources

### 2.1. Domain event listener (automatic)

```
ReminderExecution created (status=SENT/FAILED)  → activityType EMAIL_SENT / EMAIL_FAILED
PaymentAllocation created                       → activityType PAYMENT_RECEIVED
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
