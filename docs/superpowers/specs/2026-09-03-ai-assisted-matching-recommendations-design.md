# AI-Assisted Matching Recommendations Design

> Issue: [#378](https://github.com/lengocanh2005it/casso-ledger/issues/378)
>
> Approved through the 2026-09-03 grilling session. This design adds a bounded,
> advisory AI stage to the existing webhook matching flow without making an
> LLM the authority for financial state changes.

> **Implementation status (2026-09-03):** Implemented on branch
> `feat/ai-assisted-matching` for issue [#378](https://github.com/lengocanh2005it/casso-ledger/issues/378).
> The feature remains opt-in (`AI_MATCHING_ENABLED=false` by default). Focused
> tests, architecture checks, type-checks, and lint pass; the full verification
> gate still reports two pre-existing date-sensitive billing assertions, and
> e2e requires a container runtime that is unavailable in the implementation
> environment.

## 1. Goal and scope

When the deterministic matching engine routes an inbound bank transaction to
`PENDING_REVIEW` (top score `60-89`), the system asks the configured
OpenAI-compatible provider to recommend one of the top five deterministic
candidates or abstain. The recommendation is persisted and shown in the
existing Exception Queue UI. Existing deterministic scoring, auto-allocation,
manual allocation, batch allocation, and domain validation remain authoritative.

The feature is not used for `>=90` auto-match transactions or `<60`
`UNMATCHED` transactions. It is not a training system, an online learner, a
new payment-allocation path, or a new user-configurable AI product.

## 2. Architecture

```text
Webhook worker
  -> normalize + deterministic MatchingEngineService
  -> if top score is 60-89 and feature is enabled:
       MatchingAiRecommendationService
         -> per-webhook Redis lock
         -> per-organization daily attempt quota/concurrency guard
         -> shared AIProviderModule / OpenAI-compatible provider
         -> strict tool-call validation
  -> one DB transaction:
       BankTransaction + MatchingCandidate rows + optional recommendation
  -> existing Exception Queue read API
  -> existing Exception Queue list/detail UI
```

`MatchingAiRecommendationService` is an application-layer service. It depends
on a shared AI provider port, a Redis-backed guard port, and no concrete SDK.
The OpenAI SDK adapter and provider token live in a shared `AIProviderModule`
consumed by both Copilot and Webhooks. No AI call runs while a database
transaction or row lock is held.

The deterministic scorer remains the source of `totalScore`, candidate order,
and the `>=90` auto-match decision. AI produces separate recommendation
metadata; it never changes transaction status, payment amount, receivable
status, or allocation behavior.

## 3. AI input and output contract

The model receives only the tenant-scoped transaction and at most five
deterministic candidates. Candidate identities are ephemeral aliases (`C1` to
`C5`) mapped to real receivables on the server. The prompt contains:

- transaction amount in integer VND, transaction date, counterparty name;
- counterparty account number with all but the last four digits masked;
- transfer content truncated to 500 characters;
- each candidate's alias, customer name, invoice number, remaining amount,
  and due date.

The prompt explicitly treats transfer content and names as untrusted data,
ignores any instructions found inside them, and gives the model no action
tools.

The provider is asked to make exactly one tool call:

```typescript
{
  candidate: 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'ABSTAIN';
  confidence: number; // integer 0..100
  reason: string; // Vietnamese plain text, max 240 characters
}
```

The server rejects a candidate alias not present in the supplied set, a
non-integer/out-of-range confidence, missing required fields, or an invalid
tool-call shape. Control characters are stripped and the reason is rendered as
plain text. A candidate recommendation below confidence `70` is converted to
`ABSTAINED`. A valid `ABSTAIN` is stored as `ABSTAINED`. Invalid output and
provider failures are stored as `FAILED` with a stable internal failure code
and no raw provider error.

## 4. Persistence and API

`BankTransaction` gains one nullable, typed JSONB recommendation payload. It is
null when the transaction was not eligible or the feature flag was disabled.
When an evaluation was attempted, the payload stores:

```typescript
type AiRecommendationStatus = 'SUCCEEDED' | 'ABSTAINED' | 'FAILED';

interface AiMatchingRecommendation {
  status: AiRecommendationStatus;
  recommendedReceivableId: string | null;
  confidence: number | null;
  reason: string | null;
  model: string;
  promptVersion: 'matching-v1';
  evaluatedAt: string; // ISO timestamp
  failureCode?:
    | 'PROVIDER_UNAVAILABLE'
    | 'TIMEOUT'
    | 'INVALID_OUTPUT'
    | 'QUOTA_EXCEEDED'
    | 'LOCK_UNAVAILABLE';
}
```

The field is written atomically with the transaction and matching candidates.
Existing rows receive null through a nullable migration; no AI backfill or
index is added. The payload follows the bank transaction's retention lifetime.
Changing model or prompt version does not rewrite historical evaluations.

The existing `GET /api/v1/bank-transactions/unmatched` response gains an
optional `aiRecommendation` field containing only `status`,
`recommendedReceivableId`, `confidence`, `reason`, and a derived `isCurrent`
flag. Model, prompt version, latency, and failure details stay server-side.
No new endpoint or permission is introduced. Existing candidate responses and
manual/batch match endpoints remain compatible.

`isCurrent` is derived at read time. It is false when the recommended
receivable is no longer among the persisted candidates or is no longer open
with positive remaining balance. The stored evaluation is not mutated. The
existing match use case revalidates all current receivable and allocation
rules before writing.

## 5. Provider, rollout, and limits

The existing OpenAI-compatible configuration is reused:

- `AI_PROVIDER_API_KEY`
- `AI_PROVIDER_BASE_URL`
- `AI_PROVIDER_MODEL` (default `gpt-4o-mini`)

Matching adds `AI_MATCHING_ENABLED` (default `false`), a daily attempt limit
of 100 per organization, a per-organization concurrency limit of 2, and a
5-second timeout per attempt. A single retry is allowed only for transient
network/5xx/timeout failures; each provider attempt consumes quota. The daily
counter resets at `00:00` in `Asia/Ho_Chi_Minh`.

Redis provides an atomic per-webhook lock and quota/concurrency guards. A lock
or limiter failure fails closed for AI and continues the deterministic review
flow. A persisted `SUCCEEDED` or `ABSTAINED` evaluation is not recomputed;
explicit webhook reprocess may retry only `FAILED`. A database rollback before
the evaluation is persisted may cause a later webhook attempt to call the
provider again.

No new plan tier or Copilot quota is used. Structured logs include
organization, transaction/webhook identifiers, model, prompt version, status,
latency, attempt count, and request id. Raw prompts, credentials, and raw
provider errors are never logged.

## 6. UI behavior

The Exception Queue list shows a small `Gợi ý AI` badge only for a current
`SUCCEEDED` recommendation. The existing match dialog shows the qualitative
confidence (`Vừa` for `70-79`, `Cao` for `80-100`) and the sanitized Vietnamese
reason. For `ABSTAINED`, `FAILED`, null, or stale recommendations it shows
`AI không có gợi ý` without a retry action.

The UI does not prefill amounts, add a one-click AI action, or change the
existing manual/split/batch allocation controls. The user must continue
through the current permission checks and confirmation flow.

## 7. Audit, feedback, and security

AI evaluation itself is not an audit event. When a user later matches the
transaction, the existing audit record retains the recommendation snapshot and
correlates the selected receivable(s), allowing `aiAccepted` to be derived as
true when the recommended receivable receives a positive allocation and false
otherwise. No feedback table or online learning is introduced.

The provider receives only the minimum fields listed above. The backend
sanitizes model text and the frontend renders it as plain text. Missing
configuration, quota exhaustion, Redis failure, malformed output, and provider
errors never fail or duplicate the webhook's financial processing.

## 8. Testing

- Matching application tests verify the eligible `60-89` path, top-five alias
  mapping, `ABSTAIN`, confidence conversion, invalid output, stale detection,
  and deterministic `>=90` behavior with no provider call.
- Provider/guard tests use mocks and cover timeout/transient retry, quota,
  concurrency, lock failure, Redis failure, and redaction/truncation.
- Backend integration tests verify one atomic webhook result, persisted JSONB,
  reprocess behavior, tenant isolation, and fallback when the provider is
  unavailable.
- Controller/DTO tests verify the optional API field and that internal model,
  prompt, and failure details are not exposed.
- Frontend tests verify list badge, dialog reason/confidence, stale/failed
  states, and unchanged manual allocation behavior.
- CI never calls a live OpenAI/OpenRouter provider; live-provider verification
  is a manual environment check after rollout.

The shipped implementation covers the unit/contract slices above without
calling a live provider in CI. Full e2e remains an environment-dependent check
because it needs Postgres, Redis, and a working Testcontainers runtime.
