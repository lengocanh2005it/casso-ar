# Exception Queue + Audit Log Design

> Sub-spec of [docs/overview.md](../../../docs/overview.md), dependent on [2026-08-03-domain-core-design.md](2026-08-03-domain-core-design.md) (PaymentAllocation, overpayment rule) and [2026-08-03-webhook-matching-engine-design.md](2026-08-03-webhook-matching-engine-design.md) (BankTransaction, MatchingCandidate, threshold 60-89).

## 1. Exception Queue — API & concurrency

```
GET  /bank-transactions/unmatched
  → BankTransaction status IN (PENDING_REVIEW), with the top candidate + score

GET  /bank-transactions/:id/candidates
  → list of MatchingCandidate records for the transaction, sorted by descending totalScore

POST /bank-transactions/:id/match
  body: { allocations: [{ receivableId, amount }], version }
  1. Check BankTransaction.version == payload.version AND status == PENDING_REVIEW
     → if they do not match (already processed by someone else) → 409 "Transaction has already been processed"
  2. Validate SUM(allocations.amount) <= BankTransaction.amount
  3. Validate each allocations[i].amount <= Receivable[i].remainingAmount at this time
  4. In one DB transaction: call `AllocatePaymentUseCase.allocateWithinTransaction` for each allocation,
     update BankTransaction (status=MATCHED, version++),
      update the status of each related Receivable (per the rule in section 3 of the Domain Core spec)
  5. The remainder (amount - SUM(allocations)) → handle as an overpayment (section 4 of the Domain Core spec)

POST /bank-transactions/:id/skip         → status=IGNORED, write an AuditLog, create no allocation
POST /bank-transactions/:id/mark-prepaid → assign customerId and retain it as a credit balance (Payment not allocated)
```

`version` is the optimistic lock field on `BankTransaction`, incremented whenever the status changes — preventing two accountants from processing the same transaction concurrently (double allocation).

The accountant selects multiple `MatchingCandidate` records at once and enters the allocation amount for each one (split), then submits once through `POST /bank-transactions/:id/match` with the `allocations` array — the backend processes it atomically in one transaction instead of making multiple separate API calls.

## 2. Audit Log — mechanism & structure

```
AuditLog
  id, organizationId, userId, actionType, entityType, entityId,
  beforeState (jsonb, nullable), afterState (jsonb, nullable),
  ipAddress, createdAt
```

The request-scoped `AuditContext` must contain both `before` and `after` (both nullable), with `setBefore/getBefore`
and `setAfter/getAfter`; the interceptor only writes an INSERT after the handler succeeds and stores both redacted
snapshots. There is no PATCH/DELETE for `AuditLog`.

Logging uses a shared decorator + interceptor to avoid forgetting to call logging manually in each location:

```
@Audited(actionType: string) — decorator on the controller method
AuditInterceptor:
  1. Run the handler normally
  2. If it succeeds (does not throw) → write an AuditLog with:
     - userId/organizationId from the request context
     - entityType/entityId from the response or route param
     - beforeState: the service calls ctx.setAuditBefore(entity) when it loads the record for update,
       before changing it
     - afterState: call `ctx.setAfter(response)` and then read it through `getAfter()`
  3. If the handler throws → do not write a log (failed actions are not audited)
```

`PAYMENT_ALLOCATE_UNDO` is an intentional exception: the undo use case must write
`AuditLog` in the same transaction as the allocation soft-delete and rollup updates, so Domain Core writes it inline
through `IAuditLogRepository` instead of letting `AuditInterceptor` write a second entry after the HTTP handler finishes.
All other actions use `@Audited` + the interceptor as described above.

The following actions must be audited (from section 15 of the source document); HTTP actions use `@Audited`, except
for `PAYMENT_ALLOCATE_UNDO` as described above:

```
RECEIVABLE_CREATE, RECEIVABLE_UPDATE, RECEIVABLE_WRITE_OFF, RECEIVABLE_CANCEL, RECEIVABLE_DISPUTE
PAYMENT_ALLOCATE, PAYMENT_ALLOCATE_UNDO
REMINDER_POLICY_UPDATE
BANK_CONNECTION_CREATE, BANK_CONNECTION_DISCONNECT
SUBSCRIPTION_CHANGE_PLAN
```

`AuditLog` has no PATCH/DELETE endpoint — INSERT only, preserving immutability. Retention: retain it for at least the organization-wide retention policy (section 20 of the source document); do not automatically delete it in the MVP.

## 3. Out of scope

- Detailed Exception Queue page UI (described in sections 7.10 and 18 of the source document).
- Special-format audit log exports/compliance reports.
- Custom retention configuration per organization.

## 4. Open questions (do not block implementation)

- Should `skip`/`mark-prepaid` require the same optimistic lock `version` as `match`, or is the lower risk acceptable because they do not write an allocation?
- Should any sensitive fields be filtered from `beforeState`/`afterState` before storage (for example, do not log accessToken when the entity is BankConnection)?
