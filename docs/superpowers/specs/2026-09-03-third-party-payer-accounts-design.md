# Third-Party Payer Accounts Design

> Issue: [#382](https://github.com/lengocanh2005it/casso-ledger/issues/382)
> (sub-issue of [#378 — AI-assisted matching recommendations](https://github.com/lengocanh2005it/casso-ledger/issues/378))
>
> Approved through the 2026-09-03 brainstorming session.

## 1. Goal and scope

Model third-party payer accounts separately from the customer that owns the
receivable, so a parent company, affiliate, employee, or other authorized payer
can pay on a customer's behalf without turning the payer account into an
incorrect customer identity.

A "payer" in this design is a **normalized bank account number**, not a distinct
party entity. One payer account may be linked to many customers, and one
customer may have many linked payer accounts, within one organization. Payer
links are **matching signals only**: they widen and score the candidate set,
they never allocate money or change a transaction status on their own. Every
link is created or changed only after an explicit user confirmation.

### In scope

- Evolve `customer_bank_accounts` from a one-account-one-customer table into an
  organization-scoped many-to-many authorization link between a payer account
  number and a customer, with per-link confirmation provenance.
- One database migration (index swap + two nullable columns + backfill).
- Matching engine: resolve **all** customers linked to the transaction's
  counterparty account, union their open receivables into the candidate set,
  and apply the account / payer-name / timing signals to every candidate whose
  customer is in the linked set.
- Auto-match ambiguity guard: never auto-match when two candidates for
  **different customers** both clear the auto-match threshold.
- Reuse the existing per-customer bank-account management UI (the card reworded
  in #381 plus `CustomerBankAccountDialog`) to add a cross-customer link behind
  an explicit confirmation.
- Exception Queue read API + UI: present the payer (counterparty account + name
  + linked customers) as a concept visually distinct from the proposed
  receivable's customer, while keeping manual and batch allocation unchanged.

### Out of scope

- A distinct payer **party** entity that groups several accounts, and any UI to
  assert "these accounts are the same payer". Deferred; a `Payer` wrapper can
  be layered on later without breaking this model.
- Remembering a payer account **from inside the confirmed-match flow** — that is
  issue [#380](https://github.com/lengocanh2005it/casso-ledger/issues/380),
  built on top of this model.
- A dedicated payer-browsing screen (list payers, see every customer per payer).
- Changes to deterministic score weights, the AI recommendation stage (#378),
  auto-allocation math, `>=90` / `60-89` / `<60` band boundaries, or domain
  validation of allocations.
- Renaming the `customer_bank_accounts` table or the `CustomerBankAccount`
  domain class. The issue itself still calls these mappings
  `CustomerBankAccount`; a rename would churn ~40 files and a rename migration
  for no behavior change.

## 2. Domain model

### 2.1 `CustomerBankAccount` (unchanged name, widened meaning)

A row now represents: **within organization `O`, customer `C` has authorized
payer account number `A` as a payment source.** It is no longer "the customer's
own bank account".

```typescript
export interface CustomerBankAccountProps {
  id: string;
  organizationId: string;
  customerId: string;
  accountNumber: string; // normalized, see account-number-normalizer.ts
  isActive: boolean;
  confirmedByUserId: string | null; // NULL for legacy rows migrated in
  confirmedAt: Date | null;         // NULL for legacy rows without a known time
  createdAt: Date;
  updatedAt: Date;
}
```

Behavior methods (`deactivate`, `setActive`, `changeAccountNumber`) are
unchanged. A new factory-style helper is not required; `confirmedByUserId` /
`confirmedAt` are set by the create use case at construction time.

Add a short class comment stating that a row is an **authorization link**
between a customer and a third-party payer account, not the customer's own
account, and that the same `accountNumber` may appear against multiple
`customerId`s in one organization.

### 2.2 Invariants

- Unique **`(organizationId, accountNumber, customerId)`** where `isActive` — a
  customer cannot have the same active payer account linked twice.
- The pair `(organizationId, accountNumber)` is **no longer unique**.
- Every write is scoped by `organizationId` (`TenantContextService`).
- `accountNumber` is stored normalized (existing
  `account-number-normalizer.ts`), so cross-customer detection and matching
  compare normalized values.

## 3. Database migration

One migration, `AddPayerLinkColumnsToCustomerBankAccounts`
(`apps/backend/src/database/migrations/`):

1. Drop unique index `IDX_customer_bank_accounts_org_account`
   (`@Index(['organizationId', 'accountNumber'], { unique: true })`).
2. Add column `confirmedByUserId varchar NULL`.
3. Add column `confirmedAt timestamptz NULL`.
4. Backfill: `UPDATE customer_bank_accounts SET "confirmedAt" = "createdAt"`
   (existing rows were deliberately created by a user through the management
   UI, so they count as confirmed; the acting user is unknown, so
   `confirmedByUserId` stays NULL).
5. Create unique index
   `IDX_customer_bank_accounts_org_account_customer` on
   `(organizationId, accountNumber, customerId)` with a partial predicate
   `WHERE "isActive"` (mirrors the existing partial-unique pattern used by
   `DisputeOrmEntity` / the single-owner membership index).
6. Keep the existing non-unique
   `(organizationId, accountNumber, isActive)` index — still the matching
   engine's lookup path.

`down()` reverses the steps: drop the new unique index and columns, recreate
the old `(organizationId, accountNumber)` unique index. `down()` will fail if
duplicate `(organizationId, accountNumber)` pairs exist by then; that is
acceptable for a forward-only rollout and is documented in the migration.

This is a schema + data migration and is exempt from the TDD workflow;
compatibility is covered by the e2e test in §7.

## 4. Matching engine

File: `apps/backend/src/modules/webhooks/application/matching-engine.service.ts`.

### 4.1 Repository port

`ICustomerBankAccountRepository`:

- Replace `findByAccountNumber(accountNumber): Promise<CustomerBankAccount | null>`
  with `findActiveByAccountNumber(accountNumber): Promise<CustomerBankAccount[]>`
  (active links only, tenant-scoped by the caller's org).
- `findByCustomerId`, `findById`, `save` unchanged.
- The engine's constructor `Pick<ICustomerBankAccountRepository, 'findByAccountNumber' | 'save'>`
  becomes `Pick<…, 'findActiveByAccountNumber' | 'save'>`.

`findByAccountNumber` has one other caller path — `receive-webhook.usecase.ts`
uses `bankConnectionRepo.findByAccountNumber`, which is a **different**
repository (bank connections) and is not touched.

### 4.2 `scoreCandidates`

```
links = bankAccountRepo.findActiveByAccountNumber(txn.counterpartyAccountNumber)
linkedCustomerIds = new Set(links.map(l => l.customerId))
```

- If `linkedCustomerIds` is non-empty:
  - `receivables` = union of `receivableRepo.findOpenByCustomerId(id)` for every
    `id` in `linkedCustomerIds` (dedupe by receivable id).
  - The account is "known" for scoring purposes.
- Else: unchanged — org-wide top-N scan, then reference-code resolution as
  today.

Per-candidate scoring changes: replace the current `customerId ? … : 0`
gating with `linkedCustomerIds.has(receivable.customerId) ? … : 0` for
`customerBankAccountScore`, `payerNameScore`, and `timingScore`. Reference-code
and amount scores are unchanged (they never depended on identity).

`customerBankAccountScore(counterpartyAccountNumber, savedAccountNumbers)` keeps
its signature; the engine passes the normalized counterparty account as the
single saved value when the account is known (the score is a boolean +10 for
any candidate in the linked set).

Candidate ordering, `totalScore`, and `MatchingCandidate` persistence are
otherwise unchanged. Each persisted candidate keeps its own `customerId`.

### 4.3 Auto-match ambiguity guard

Files: `process-webhook.usecase.ts` and `reprocess-webhook.usecase.ts`.

Today: `if (top && top.totalScore >= AUTO_MATCH_THRESHOLD) { auto-match }`.

New precondition — auto-match only when the winner is unambiguous:

```typescript
const clearedTop = candidates.filter(
  (c) => c.totalScore >= AUTO_MATCH_THRESHOLD,
);
const ambiguousAcrossCustomers = clearedTop.some(
  (c) => c.customerId !== top.customerId,
);
if (top && top.totalScore >= AUTO_MATCH_THRESHOLD && !ambiguousAcrossCustomers) {
  // auto-match
} else if (top && top.totalScore >= EXCEPTION_QUEUE_THRESHOLD) {
  // PENDING_REVIEW (AI recommendation stage still applies to the 60-89 band)
}
```

When two different customers both clear the threshold the transaction routes to
`PENDING_REVIEW` for a human, satisfying AC#4 ("payer relationships … cannot
autonomously allocate money"). The AI recommendation stage is unaffected — it
already only runs for the `60-89` band.

## 5. Write flow

### 5.1 `CreateCustomerBankAccountUseCase`

`CreateCustomerBankAccountInput` gains `acknowledgeExistingLinks?: boolean`
(default `false`).

Logic, inside the existing tenant scope:

1. Normalize `accountNumber`.
2. Look up active links for `(organizationId, normalizedAccountNumber)`.
3. If any link exists for a **different** `customerId` and
   `acknowledgeExistingLinks` is not `true`:
   throw `AppError(ErrorCode.CONFLICT, 'Số tài khoản này đang liên kết với khách hàng khác.', { linkedCustomerNames: string[] })`
   (`linkedCustomerNames` resolved through the existing `ICustomerRepository`).
4. If an active link already exists for the **same** `customerId`: the insert
   hits the new partial-unique index and the repository translates the
   `QueryFailedError` to `CONFLICT` exactly as today.
5. Otherwise construct the `CustomerBankAccount` with
   `confirmedByUserId = <acting user id>` and `confirmedAt = new Date()` and
   save.

`UpdateCustomerBankAccountUseCase` (also handles reactivate) and
`DeactivateCustomerBankAccountUseCase` are unchanged; they already operate
per-row, which is now per-link. Reactivating a link re-checks the partial
unique index.

RBAC: unchanged. `CUSTOMER_BANK_ACCOUNT_MANAGE` gates create / update /
deactivate, including the cross-customer link.

Audit: keep whatever `@Audited` coverage the use cases have today; the new
`confirmedByUserId` / `confirmedAt` columns add per-link provenance without a
new audit event.

### 5.2 DTO + response

- `CreateCustomerBankAccountDto` gains `acknowledgeExistingLinks?: boolean`
  (`@IsOptional() @IsBoolean()`), documented with `@ApiProperty`.
- `CustomerBankAccountResponseDto` does **not** expose `confirmedByUserId`
  (internal id) or `confirmedAt`. No UI consumes them; they are per-link
  provenance for audit only. Add them to the response later if a UI need
  appears.
- `CONFLICT` maps to HTTP 409 already (`status-by-error-code.ts`); the
  `details.linkedCustomerNames` array rides in the standard error `details`
  field.

### 5.3 Frontend

`apps/frontend/src/features/customers/components/customer-bank-account-dialog.tsx`:

- On submit failure with `getApiErrorCode(error) === 'CONFLICT'` **and**
  `details.linkedCustomerNames` present: instead of the current
  `DUPLICATE_ACCOUNT_HINT` inline message, show an in-dialog confirmation step
  ("Số tài khoản này đang liên kết với: `<tên KH…>`. Vẫn liên kết với khách
  hàng này?") with a confirm button that re-submits the same payload plus
  `acknowledgeExistingLinks: true`.
- A same-customer `CONFLICT` (no `linkedCustomerNames`) keeps the existing
  inline hint.

`apps/frontend/src/features/customers/components/customer-bank-accounts-card.tsx`:

- Extend the description added in #381 to note that one account may belong to
  several customers (a payer paying on their behalf). No structural change.

## 6. Exception Queue read + UI

### 6.1 Query service

`apps/backend/src/modules/exception-queue/application/unmatched-bank-transactions-query.service.ts`:

For each unmatched transaction, build a `payer` view:

```typescript
interface PayerView {
  accountNumberMasked: string; // counterpartyAccountNumber, masked like elsewhere
  name: string;                // counterpartyName
  linkedCustomers: { customerId: string; customerName: string }[];
}
```

`linkedCustomers` comes from one tenant-scoped
`findActiveByAccountNumber(counterpartyAccountNumber)` per page (batch the
lookups across the page's transactions; names via the existing
`ICustomerRepository` batch method). Empty array when the account is unknown.

### 6.2 DTO

`UnmatchedBankTransactionResponseDto` gains
`payer: PayerResponseDto` (`accountNumberMasked`, `name`,
`linkedCustomers: PayerLinkedCustomerDto[]`), all documented with
`@ApiProperty`. `PayerResponseDto` and `PayerLinkedCustomerDto` are `class`
types in a `.dto.ts` file per the Swagger-plugin rule. No internal fields.

### 6.3 Frontend

`apps/frontend/src/features/exceptions/`:

- `types.ts` + `exceptions-api.ts`: add the `payer` shape.
- `exceptions-page.tsx` (and `split-match-dialog.tsx` where the same
  transaction header is shown): render a labelled **"Người chuyển khoản"**
  block — masked account, name, and a row of linked-customer chips — visually
  separated from the candidate list / proposed receivable customer. When
  `linkedCustomers` is empty, show only account + name.
- Manual allocation, batch allocation, split-match, skip, and mark-prepaid
  flows are unchanged.

## 7. Testing

TDD (RED → GREEN → REFACTOR) for every code change below; the migration in §3
is the stated exception.

### Backend unit

- `matching-engine.service.spec.ts`:
  - counterparty account linked to customers C1 and C2, both with open
    receivables → candidates from both customers, each with
    `customerBankAccountScore == 10`.
  - third-party payer: counterparty name differs from the linked customer's
    name → still produces candidates for that customer (payer-name score may be
    0, account score is 10); no customer-mismatch rejection at scoring time.
  - account linked to C1 only → behaves as today (scope = C1's receivables).
  - unknown account → unchanged org-wide fallback.
- `process-webhook.usecase.spec.ts` / `reprocess-webhook.usecase.spec.ts`:
  two candidates for different customers both `>= 90` → transaction goes to
  `PENDING_REVIEW`, no payment created. Single customer `>= 90` → still
  auto-matches.
- `customer-bank-account.usecase.spec.ts`:
  - create link for an account already active on another customer without the
    flag → `CONFLICT` with `linkedCustomerNames`.
  - same call with `acknowledgeExistingLinks: true` → link created,
    `confirmedByUserId` / `confirmedAt` set.
  - create a second active link for the **same** customer → `CONFLICT`.
- `typeorm-customer-bank-account.repository.spec.ts`:
  `findActiveByAccountNumber` returns every active link across customers, scoped
  to the caller's organization; inactive links excluded.
- `unmatched-bank-transactions-query.service.spec.ts`: `payer.linkedCustomers`
  reflects active links; unknown account → empty array; links from another
  organization never appear (tenant isolation).

### Backend e2e

- `test/customer-bank-account-management.e2e-spec.ts`: link one account to two
  customers in the same org through the API (second call with the
  acknowledgement flag); confirm a pre-migration-style row still lists and
  updates correctly.
- `test/webhook-matching.e2e-spec.ts`: a webhook transaction from a payer
  account linked to a non-owning customer is scored against that customer's
  receivables; ambiguous double-`>=90` lands in the Exception Queue.
- Tenant isolation: an account number linked in org A does not influence org
  B's matching or Exception Queue payer view.

### Frontend

- `customer-bank-account-dialog.spec.tsx`: `CONFLICT` + `linkedCustomerNames`
  → confirmation step shown → confirm re-submits with
  `acknowledgeExistingLinks: true`; same-customer `CONFLICT` → inline hint only.
- `exceptions-page.spec.tsx`: payer block renders masked account + name +
  linked-customer chips, separate from the candidate customer; empty
  `linkedCustomers` → account + name only.
- `customer-bank-accounts-card.spec.tsx`: description mentions multi-customer
  payer accounts.

### Verification gate

`pnpm verify` (lint + type-check + unit) and, where a container runtime is
available, `pnpm --filter @casso-ar/backend test:e2e`. `/domain-check` after
the backend changes.

## 8. Acceptance criteria mapping

| # | Acceptance criterion | Covered by |
|---|---|---|
| 1 | Domain distinguishes payer from owning customer | §2 (row = authorization link), §6 (payer view) |
| 2 | One payer ↔ many customers, one customer ↔ many payer accounts | §2.2 (drop `(org, account)` unique), §4.2 (fan-out) |
| 3 | Links created/updated only after explicit confirmation; no silent reassign | §5.1 (`acknowledgeExistingLinks`), §5.3 (confirm step), `confirmedByUserId`/`confirmedAt` |
| 4 | Payer relationships are matching signals only | §4.2 (score only), §4.3 (ambiguity guard) |
| 5 | Exception Queue presents payer and proposed customer separately | §6 |
| 6 | Existing `CustomerBankAccount` mappings compatible / explicit migration | §2 (same table/class), §3 (migration + backfill), §7 e2e |
| 7 | Tests: third-party payment, conflicting mappings, multiple customers, tenant isolation | §7 |
