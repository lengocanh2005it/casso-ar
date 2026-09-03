# Webhook Ingestion + Matching Engine Design

> Sub-spec of [docs/overview.md](../../../docs/overview.md), dependent on [2026-08-03-domain-core-design.md](2026-08-03-domain-core-design.md). Defines how the system receives transactions from CASSO Balance Hook, prevents duplicates, and reconciles them against Receivable. The optional advisory AI extension is documented in [2026-09-03-ai-assisted-matching-recommendations-design.md](2026-09-03-ai-assisted-matching-recommendations-design.md).

## 0. Reference source

Information about CASSO Balance Hook comes from [cas.so/product/balance-hook](https://cas.so/product/balance-hook) (accessed 08/2026):
- Real-time webhook notifications when the balance of a connected account/VA changes.
- Payload includes: Transaction ID + unique code, transaction time, amount, balance after the transaction, account number (regular + VA), bank information, counterparty account information, and currency (VND).
- Authentication uses headers: API version, client ID, secret key (not an HMAC signature on the payload).
- The public docs do not clearly describe the retry mechanism — confirm it with the Developer Portal/internal technical documentation before production deployment.

## 1. Scope & overall flow

Scope: webhook ingestion (receive, authenticate, deduplicate) + Matching Engine (find matching Receivables, calculate scores, and decide auto-match/exception/unmatched).

Out of scope: Exception Queue allocation UI, the Cas ID connection/consent flow (separate spec), and Payment Allocation transaction details (covered in the Domain Core spec). AI recommendation input/output, rollout, and UI context are specified separately in the AI matching extension.

```
CASSO Balance Hook (POST) → Webhook Controller
    → Validate headers (client ID + secret key, constant-time compare)
    → WebhookInbox (insert, unique key = Balance Hook Transaction ID)
        → if the key is duplicated → return 200 immediately, with no further processing
    → Queue (BullMQ)
    → Transaction Normalizer (map Balance Hook payload → internal BankTransaction)
    → Matching Engine (calculate score, find Receivable candidates)
    → score >= 90 → automatic Payment Allocation
    → score 60-89 → Exception Queue (accountant review)
                     → optional advisory AI second pass (top five candidates or ABSTAIN)
    → score < 60 → BankTransaction.status = UNMATCHED
```

## 2. Entities

```
WebhookInbox
  id, organizationId, bankConnectionId, providerTransactionId (unique, from Balance Hook Transaction ID),
  rawPayload (jsonb), receivedAt, status (RECEIVED/PROCESSED/FAILED),
  processedAt, errorMessage, retryCount

BankTransaction
  id, organizationId, bankConnectionId, webhookInboxId,
  providerTransactionId, amount, transactionDateTime,
  counterpartyAccountNumber, counterpartyName, transferContent,
  status (UNMATCHED/PENDING_REVIEW/MATCHED/IGNORED), version,
  aiRecommendation (nullable JSONB advisory result),
  createdAt

MatchingCandidate
  id, bankTransactionId, receivableId,
  referenceCodeScore, amountScore, customerBankAccountScore,
  payerNameScore, timingScore, totalScore,
  createdAt
```

`WebhookInbox` retains the raw payload for audit/replay and is separate from `BankTransaction` (normalized data), so the Matching Engine does not depend on the Balance Hook's specific structure — if the payload format changes, only Transaction Normalizer needs updating.

## 3. Candidate scope & scoring

### Candidate scope

- If `customerId` can be resolved — by matching `counterpartyAccountNumber` to a stored `CustomerBankAccount`, or by finding an invoice/receivable code in `transferContent` — consider only that customer's `Receivable` records with `status IN (OPEN, PARTIALLY_PAID)`.
- If the customer cannot be resolved, scan all `Receivable OPEN/PARTIALLY_PAID` records in the organization, limit to the top N closest by `dueDate`, and calculate only `referenceCodeScore` + `amountScore` (the only two criteria that do not require knowing the customer).

### Scoring (retain the additive formula from the original brainstorm)

```
referenceCodeScore (0-60): transferContent contains the exact invoiceNumber/receivable code → 60,
                            contains a near-match code (missing characters, malformed) → 30, absent → 0
amountScore        (0-20): amount == remainingAmount → 20, differs by no more than ±1% → 10, otherwise → 0
customerBankAccountScore (0-10): counterpartyAccountNumber matches a stored CustomerBankAccount → 10, different → 0
payerNameScore     (0-5):  fuzzy match of counterpartyName against Customer.name exceeds the similarity threshold → 5, otherwise → 0
timingScore        (0-5):  transactionDateTime within [dueDate-30 days, dueDate+30 days] → 5, outside → 0

totalScore = sum of 5 components, maximum 100
```

Each score component is an independent pure function and is easy to unit test separately.

### Decision thresholds

```
totalScore >= 90   → automatic Payment Allocation
totalScore 60-89   → Exception Queue, suggested in descending totalScore order
totalScore < 60    → BankTransaction.status = UNMATCHED
```

For a `60–89` transaction, the optional AI extension receives only the top
five deterministic candidates and returns display-only advice. It runs before
the existing persistence transaction, is disabled by default, and cannot
change the score, status, amount, or allocation decision. See the [AI
matching design](2026-09-03-ai-assisted-matching-recommendations-design.md).

## 4. Idempotency, auth & edge cases

1. **Authentication**: compare the client ID + secret key headers against server-side values using constant-time comparison. Invalid or missing headers → 401.
2. **Idempotency**: insert `WebhookInbox` with `unique(providerTransactionId)`. If insertion fails because the key is duplicated → return 200 immediately and do not enqueue processing again (the transaction was handled on the previous receipt).
3. **Retry**: if processing fails after `WebhookInbox` was inserted successfully (an error in Normalizer or Matching Engine), the processor must persist `WebhookInbox.status = FAILED`, `retryCount++`, and `errorMessage` (length-limited and containing no token/raw secret), then let BullMQ retry with backoff, up to N times before moving to the Dead Letter Queue. On success, persist `PROCESSED`.
4. **Refund/negative transactions**: `amount < 0` does not enter the Matching Engine — route it to a separate refund flow (refund-flow details are out of scope for this doc).
5. **Genuine duplicate transactions** (a customer transfers the same amount twice with different `providerTransactionId` values): these are 2 valid `BankTransaction` records, not an idempotency error — the Matching Engine processes them normally as two separate transactions (which may cause an overpayment if the receivable is already fully paid, handled according to the overpayment rule in section 4 of the Domain Core spec).
6. **AI advisory failures**: feature-disabled, Redis guard, timeout, provider, or malformed-output conditions never fail deterministic webhook processing. AI is called outside the DB transaction; successful/abstained evaluations are retained, while reads never call the provider.

## 5. Out of scope

- Cas ID connection/consent flow — separate spec.
- Exception Queue UI (interface and accountant actions) — described in sections 7.10 and 18 of the source document.
- The actual retry mechanism details of CASSO Balance Hook — confirm with the Developer Portal/internal technical documentation before production deployment.

## 6. Open questions (do not block implementation)

- Does Balance Hook publish a fixed IP range so that an IP allowlist can be considered? (The current MVP uses only secret-key comparison; this is agreed.)
- Does `transferContent` from Balance Hook have a separate "unique code" field, or only the full transfer text from which to parse referenceCodeScore?
