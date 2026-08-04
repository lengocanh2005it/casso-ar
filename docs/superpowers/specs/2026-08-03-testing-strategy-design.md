# Testing Strategy Design

> Sub-spec of [docs/overview.md](../../../docs/overview.md) (deliverable "integration test suite for webhooks and payment allocation", section 9.8), dependent on [2026-08-03-domain-core-design.md](2026-08-03-domain-core-design.md) and [2026-08-03-webhook-matching-engine-design.md](2026-08-03-webhook-matching-engine-design.md).

## 1. Integration test — real DB through testcontainers

The logic depends heavily on DB transactions, unique constraints (idempotency), queues, and exact money calculations — pure unit tests with mocked DB/Redis are not reliable enough to catch real race-condition/constraint failures. Use real PostgreSQL and Redis through testcontainers.

```
Test setup:
  - testcontainers starts real PostgreSQL + Redis for each test suite (do not mock DB/Redis)
  - Seed: 1 Organization, 1 Customer, N Receivable in the state required for each case
  - Call the real webhook endpoint / API directly through the HTTP layer (supertest),
    do not call the service method directly — ensure the controller/validation/transaction layers are all tested
```

### Minimum required cases (do not reduce further)

```
1. Duplicate webhook (the same providerTransactionId sent twice)
    → only 1 BankTransaction is created; the second returns 200 without creating another record
    (see section 4 of 2026-08-03-webhook-matching-engine-design.md)

2. Partial payment → allocate a portion
    → Receivable.status = PARTIALLY_PAID, remainingAmount is calculated correctly
    (see sections 3 and 5 of 2026-08-03-domain-core-design.md)

3. Overpayment → allocate all remainingAmount, leaving the remainder
    → Payment.unallocatedAmount > 0, and no other receivable is assigned automatically
    (see section 4 of 2026-08-03-domain-core-design.md)

4. Two concurrent requests both match() the same BankTransaction
    → the second request receives 409 (optimistic lock version mismatch), with no double allocation
    (see section 1 of 2026-08-03-exception-queue-audit-log-design.md)

5. Receivable is PARTIALLY_PAID → call the CANCEL API
    → must be rejected (only WRITTEN_OFF is valid)
    (see section 3 of 2026-08-03-domain-core-design.md)
```

## 2. Additional unit tests (pure functions)

```
Matching Engine scoring: each component function (referenceCodeScore, amountScore, payerNameScore,
  customerBankAccountScore, timingScore) is a pure function → test independently,
  with no DB; fixed input/output is easy to assert.

Reminder rule matching: the offsetDays calculation + matching-rule check → pure function, with its own unit test.
```

## 3. Priority scope

Do not write integration tests for every simple CRUD operation (basic Customer/Invoice create/update/delete) — focus integration tests on genuinely risky financial invariants (the 5 cases in section 1); unit tests are sufficient for the rest.

## 4. Out of scope

- Webhook load tests (section 9.6, phase 4 of the source document — specific load-test tools/scenarios, with a separate spec if needed before the demo).
- FE E2E tests (Playwright/Cypress) — can be added after the UI stabilizes.
- A specific test-coverage threshold (%) — do not set a rigid percentage target; prioritize the right risky cases over superficial coverage.

## 5. CI contract

- CI uses a GitHub Actions runner with a Docker daemon and explicitly runs `pnpm turbo run test` and `pnpm turbo run test:e2e`; `test:e2e` must run testcontainers suites with real PostgreSQL + Redis.
- Local and CI must not downgrade testcontainers to mocks or use only shared service containers that hide environment differences.

## 6. Open questions (do not block implementation)

- Beyond the 5 required cases, are there any dispute/reminder-skip cases that also require real-DB integration tests instead of unit tests?
