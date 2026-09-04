# Remember Payer Bank Account After Confirmed Match — Design

> Issue: [#380](https://github.com/lengocanh2005it/casso-ledger/issues/380)
> (sub-issue of [#378 — AI-assisted matching recommendations](https://github.com/lengocanh2005it/casso-ledger/issues/378);
> builds directly on [#382](https://github.com/lengocanh2005it/casso-ledger/issues/382), shipped 2026-09-03 via PR #384)
>
> Approved through the 2026-09-04 grilling session.

## 1. Goal and scope

After a user confirms a bank-transaction match in the Exception Queue, let them
opt in — with a single checkbox — to remembering the transaction's normalized
payer account for the customer the match resolved to. The remembered mapping is
a plain `customer_bank_accounts` row (the org-scoped payer-account ↔ customer
authorization link introduced in #382). Future webhooks from that account then
narrow and up-score candidates toward that customer with **no further work** —
that behaviour already ships in #382's matching engine.

### 1.1 What #382 already delivers (so #380 does NOT touch it)

`apps/backend/src/modules/webhooks/application/matching-engine.service.ts`
`scoreCandidates()`:

- `links = bankAccountRepo.findActiveByAccountNumber(transaction.counterpartyAccountNumber)`;
  when any link exists, candidate receivables are restricted to the linked
  customers via `findOpenByCustomerId` fan-out, and each such candidate gets
  `customerBankAccountScore` +10 plus payer-name / timing scores.
- So **AC#5 ("a later transaction from a saved account prioritizes open
  receivables for that customer") is satisfied the moment the link row exists.**
  #380 only has to create that row.

### 1.2 In scope

- One frontend change: a "remember payer" checkbox in the single-transaction
  match dialog (`SplitMatchDialog`), and a fire-and-forget call to the existing
  `POST /api/v1/customers/:customerId/bank-accounts` endpoint after the match
  succeeds.
- Frontend component tests for the dialog behaviour.
- One backend e2e proving the full loop: confirm a match → create the link →
  a second webhook from the same counterparty account is prioritized toward
  that customer.

### 1.3 Out of scope

- **Any backend production code.** The create endpoint, `CreateCustomerBankAccountUseCase`,
  `CreateCustomerBankAccountDto`, the `customer_bank_accounts` schema/index, the
  matching engine, RBAC, and the `payer` read view were all built in #382 and
  are reused unchanged.
- **Batch match** (`POST /bank-transactions/batch-match`) and **batch
  mark-prepaid** — a batch spans many payer accounts and customers; there is no
  single account to remember per action.
- **Mark-prepaid** ("Ghi nhận công nợ" in the same dialog). It has the same
  shape (one `customerId`, same `tx.counterpartyAccountNumber`, `prepaidCustomerId`
  already in dialog state) and remembering a payer there is arguably even more
  valuable, but the issue's ACs are framed around "confirms a match". Filed as
  an easy fast-follow.
- **Inline cross-customer linking** ("Vẫn liên kết?" / `acknowledgeExistingLinks`)
  from the Exception Queue. Deliberate cross-customer linking stays on the
  customer detail page (#382). From the queue, a payer account already owned by
  another customer is a warning only, never a save.
- Any change to allocation math, receivable/transaction status transitions, or
  the AI recommendation stage. The AI model is not retrained; this stores a
  confirmed account→customer mapping only (AC#8).

## 2. Where it attaches

### 2.1 The confirm-match flow (unchanged)

`apps/frontend/src/features/exceptions/components/split-match-dialog.tsx`:

- `onMatch()` builds `allocations` (`{ receivableId, amount }[]`) from the
  candidate rows with a positive amount and calls
  `splitMatch.mutate({ id: tx.id, allocations, version: tx.version }, { onSuccess: () => onOpenChange(false), onError: ... })`.
- `splitMatch` → `POST /api/v1/bank-transactions/:id/match` →
  `MatchBankTransactionUseCase`, which enforces that every allocated receivable
  belongs to one customer (`AppError(CUSTOMER_MISMATCH)` otherwise). So the
  match always resolves to exactly one customer.

### 2.2 Data the dialog already has at confirm time

- `tx.counterpartyAccountNumber: string | null` — the **raw** account number
  (on `BankTransaction`, returned by the unmatched-list response). The `payer`
  prop only carries `accountNumberMasked`, so the raw value comes from `tx`.
- `payer.linkedCustomers: { customerId, customerName }[]` (#382) — the customers
  that already have an active link to this payer account.
- The resolved customer: derived on the client from the first allocated
  candidate. Each `MatchingCandidate` carries `customerId` / `customerName`;
  the backend guarantees they are all the same customer, so
  `chosenCustomerId = <first allocation's candidate>.customerId` and
  `chosenCustomerName = <…>.customerName`.

### 2.3 No RBAC gap

The match endpoints are gated `PAYMENT_ALLOCATE`; the create-bank-account
endpoint is gated `CUSTOMER_BANK_ACCOUNT_MANAGE`. Both permissions belong to
exactly `OWNER`, `FINANCE_MANAGER`, `ACCOUNTANT`
(`packages/shared-types/src/role-permissions.ts`). Anyone who can confirm a
match can create the link. No permission handling needed.

## 3. The change — `SplitMatchDialog`

### 3.1 New state

```ts
const [rememberPayer, setRememberPayer] = useState(true);
```

### 3.2 Resolved customer (derived)

From the current `amounts` state and `sortedCandidates`:

```ts
const chosenCandidate = sortedCandidates.find(
  (c) => Number(amounts[c.receivableId]) > 0,
);
const chosenCustomerId = chosenCandidate?.customerId ?? null;
const chosenCustomerName = chosenCandidate?.customerName ?? null;
```

### 3.3 Checkbox rendering

The checkbox is shown only when **all** of:

- `tx.counterpartyAccountNumber` is a non-empty string (AC#2 "transactions
  without an account number are skipped"). The client does **not** re-implement
  the digit-format normalizer — a non-empty-but-junk value falls through to the
  backend's `VALIDATION_ERROR` and a toast (§3.5).
- `chosenCustomerId` is **not** already in `payer.linkedCustomers`
  (`!payer?.linkedCustomers.some((c) => c.customerId === chosenCustomerId)`).
  If it is already linked, there is nothing to remember → hide entirely.

When `chosenCustomerId` is resolved and `payer.linkedCustomers` is non-empty but
contains **only other** customers (the account belongs to a different customer),
the checkbox is shown but **auto-unchecked** with an inline hint, e.g.
*"Tài khoản này đang liên kết với «{tên}». Bỏ tích để không ghi nhớ."* This
pre-empts the cross-customer conflict so the 409 path (§3.5) is only a race
fallback. Auto-uncheck is applied once, when the different-customer condition
first becomes true (so the user can re-check it deliberately — which then hits
the 409 warning on submit).

Before the user has entered any amount (`chosenCustomerId === null`), the
checkbox renders pre-checked and enabled (optimistic); the real decision is
taken at submit.

### 3.4 On match success

`onMatch()`'s existing `onSuccess` currently does only `onOpenChange(false)`.
Extend it: capture `rememberPayer`, `chosenCustomerId`, `chosenCustomerName`,
`tx.counterpartyAccountNumber` **before** closing, then:

```ts
onSuccess: () => {
  onOpenChange(false); // match is the primary action — never block on the aside
  if (rememberPayer && chosenCustomerId && tx.counterpartyAccountNumber) {
    void rememberPayerAccount(
      chosenCustomerId,
      chosenCustomerName,
      tx.counterpartyAccountNumber,
    );
  }
},
```

`rememberPayerAccount` is a small local async helper (not a hook — it needs no
mutation/cache state) that calls
`createCustomerBankAccount(customerId, { accountNumber })` from
`apps/frontend/src/features/customers/api/customers-api.ts` **without**
`acknowledgeExistingLinks`, and maps the outcome to a toast (§3.5). The match
result is already reported and the dialog already closed — AC#6 ("declining the
option or a save failure does not undo or block the current confirmed match")
holds structurally.

### 3.5 Toast outcomes of the remember call

| Outcome | Toast |
|---|---|
| success | `toast.success('Đã ghi nhớ tài khoản người chuyển cho {chosenCustomerName}.')` |
| 409 `CONFLICT` with `details.linkedCustomerNames` (cross-customer race) | `toast.warning('Tài khoản này đang liên kết với {names}. Chưa ghi nhớ.')` — AC#4, no save |
| 409 `CONFLICT` without `linkedCustomerNames` (same-customer duplicate race) | silent — the link already exists, the goal is met |
| 400 `VALIDATION_ERROR` (junk account number) | `toast.warning('Số tài khoản không hợp lệ, chưa ghi nhớ.')` |
| any other error (network, 404, 500) | `toast.error('Không ghi nhớ được tài khoản người chuyển.')` |

Error code read via the existing `getApiErrorCode` / `getApiErrorDetails`
helpers (`apps/frontend/src/lib/api-client.ts`).

### 3.6 Declining

Unchecked checkbox → no call at all (AC#6).

### 3.7 Idempotency / double-fire

`createCustomerBankAccount` goes through `postWithIdempotency`, which sends a
fresh `crypto.randomUUID()` per call — not idempotent across calls, but the
dialog closes on match success so there is no re-click surface. A genuine
duplicate (e.g. two matches for the same account+customer) is caught by the
`customer_bank_accounts` partial-unique index → 409 → handled per §3.5.

## 4. Backend

**No production code.** The reused endpoint
(`POST /api/v1/customers/:customerId/bank-accounts`,
`CustomerBankAccountsController.create`):

- input DTO `CreateCustomerBankAccountDto`: `accountNumber` (required),
  `acknowledgeExistingLinks?` (omitted here);
- `confirmedByUserId` is stamped by the controller from the current user;
- `normalizeOrThrow`s the account number → `VALIDATION_ERROR` on bad format;
- `customerRepo.findById` → `NOT_FOUND` if the customer vanished;
- same-customer active link → `CONFLICT` "Số tài khoản ngân hàng đã được liên kết.";
- other-customer active link without the ack flag → `CONFLICT` with
  `details.linkedCustomerNames` (via `assertCrossCustomerLinkAcknowledged`);
- `@Audited(CUSTOMER_BANK_ACCOUNT_CREATE, CUSTOMER_BANK_ACCOUNT)` — the remember
  action is audited for free;
- requires an `Idempotency-Key` header (supplied by `postWithIdempotency`).

## 5. Testing

### 5.1 Frontend component — `split-match-dialog.spec.tsx`

RED → GREEN per slice:

1. Checkbox is **not** rendered when `tx.counterpartyAccountNumber` is `null`
   / `''`.
2. Checkbox is rendered and **checked by default** when
   `tx.counterpartyAccountNumber` is present and `payer.linkedCustomers` is
   empty.
3. Checkbox is **not** rendered once an amount is entered for a candidate whose
   `customerId` is already in `payer.linkedCustomers`.
4. Checkbox is rendered but **auto-unchecked with a hint** when
   `payer.linkedCustomers` contains only a different customer.
5. Match success with the checkbox checked → `customers-api.createCustomerBankAccount`
   (mocked) called once with `(chosenCustomerId, { accountNumber: tx.counterpartyAccountNumber })`;
   success toast shown; dialog closed.
6. Match success with the checkbox unchecked → `createCustomerBankAccount` **not**
   called.
7. `createCustomerBankAccount` rejects with a 409 `CONFLICT` +
   `details.linkedCustomerNames` → warning toast; **`onOpenChange(false)` still
   called / match still reported as succeeded**.
8. `createCustomerBankAccount` rejects with a network error → error toast; match
   still succeeded, dialog closed.

Mock `@/features/customers/api/customers-api` and `sonner` `toast` (existing
patterns in the exceptions specs).

### 5.2 Backend e2e — `webhook-matching.e2e-spec.ts` (new `it`)

1. Seed org + customer C + an open receivable for C with an invoice number.
2. Deliver a webhook from counterparty account `A` (unknown) whose
   `transferContent` references the invoice → routes to `PENDING_REVIEW`
   (deterministic score in the 60–89 band, no `customer_bank_accounts` link
   yet).
3. `POST /api/v1/bank-transactions/:id/match` with the single allocation →
   transaction `MATCHED`.
4. `POST /api/v1/customers/:C/bank-accounts` with `{ accountNumber: 'A' }` →
   201; assert an active `customer_bank_accounts` row `(org, A, C)` exists.
5. Deliver a **second** webhook from account `A` for a *different* open
   receivable of C, with **no** invoice reference in `transferContent`.
6. Assert it is auto-matched (or at minimum the top candidate is C's receivable
   with `customerBankAccountScore == 10`), proving the saved account now
   prioritizes C — the #380 payoff via the confirm-match entry point.

Tenant isolation is already covered by #382's e2e
(`customer-bank-account-management.e2e-spec.ts` "never resolves a payer account
link across organizations").

### 5.3 Verification gate

`pnpm verify` (lint + type-check + unit) and, with a container runtime,
`pnpm --filter @casso-ar/backend test:e2e`. `/domain-check` is a no-op here
(no backend production code) but run it to confirm.

## 6. Acceptance-criteria mapping

| # | Acceptance criterion | Covered by |
|---|---|---|
| 1 | UI offers "Ghi nhớ tài khoản người chuyển cho khách hàng này" after a confirmed match | §3.3 checkbox in `SplitMatchDialog` |
| 2 | Saved only after explicit confirmation; no-account transactions skipped | §3.1 opt-in checkbox; §3.3 hidden when `counterpartyAccountNumber` empty |
| 3 | Normalized, tenant-scoped, not duplicated for the same customer | §4 reused endpoint (`normalizeOrThrow`, `BaseRepository` org scope, partial-unique index from #382) |
| 4 | Already linked to another customer → no silent reassign, warning shown | §3.3 auto-uncheck + hint; §3.5 409 warning toast; never sends `acknowledgeExistingLinks` |
| 5 | A later transaction from a saved account prioritizes that customer | §1.1 (#382 matching engine, unchanged); §5.2 e2e proves it via the confirm-match path |
| 6 | Declining or a save failure does not undo or block the confirmed match | §3.4 dialog closes first, remember call is fire-and-forget; §3.6 |
| 7 | BE + FE tests: successful save, duplicate account, cross-customer conflict, missing account, tenant isolation | §5.1 (missing account, cross-customer, success, failure-doesn't-block) + §5.2 e2e (full loop) + #382's existing backend coverage (duplicate, tenant isolation) |
| 8 | Stores a confirmed account-to-customer mapping; does not retrain the AI model | it is a plain `customer_bank_accounts` row; no AI code touched |

## 7. Effort

Small. One component file + its spec + one e2e `it`. No migration, no new
endpoint, no DTO, no module wiring — #382 did the heavy lifting. Lighter than
the `effort:m` label.
