# AI-Assisted Matching Recommendations Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task.

**Goal:** Add an advisory AI second pass for ambiguous bank-transaction matches while keeping the existing deterministic scorer authoritative and preserving safe manual review.

**Architecture:** Share the existing OpenAI-compatible provider boundary between Copilot and Webhooks through a small common AI provider module. Add a Webhooks application service that sanitizes the transaction and top five deterministic candidates, requests one strict tool result, and persists a nullable recommendation on `BankTransaction`. Invoke it only for `PENDING_REVIEW` scores from 60 through 89, outside the database transaction, behind a feature flag plus Redis lock/quota/concurrency guard. Extend the existing Exception Queue response with a derived freshness flag and display-only UI context. Keep allocation/status transitions and tenant checks unchanged.

**Tech Stack:** NestJS, TypeScript strict mode, TypeORM/Postgres JSONB migration, existing OpenAI SDK/provider port, existing ioredis client, Jest, React/React Query.

## Global constraints

- Do not add an AI SDK, matching table, training table, audit event, permission, billing tier, or live-provider CI test.
- `>=90` auto-match and `<60` unmatched paths remain byte-for-byte behaviorally deterministic; AI is never allowed to allocate, change status, or supply an amount.
- AI calls happen before the existing `DataSource.transaction()` and never while a DB lock is held. A guard/Redis failure skips AI and lets deterministic processing continue.
- Prompt input is tenant-scoped and minimized: transfer content truncated to 500 characters, counterparty account masked except the last four digits, top five candidates aliased `C1`–`C5`, and only invoice/customer/amount/due-date fields needed for comparison. Never send UUIDs, organization/user identifiers, credentials, or untrusted instructions as commands.
- Persist only typed, nullable JSONB on the bank transaction. Recommendation statuses are `SUCCEEDED`, `ABSTAINED`, and `FAILED`; no row means AI was not attempted. Store a stable failure code, never a raw provider error.
- GET/read paths never invoke AI. A successful or abstained recommendation is not recomputed on refresh; only an explicit reprocess of a failed webhook may retry the failed evaluation.
- API exposes only status, recommended receivable id, confidence, sanitized reason, and derived `isCurrent`; model, prompt version, latency, and failure code remain internal.
- Manual matching always revalidates current receivable state under its existing locks. Record `aiAccepted` in the existing manual-match audit after-state when a positive allocation includes the current AI recommendation; no new audit event is introduced.
- Add `AI_MATCHING_ENABLED=false` and bounded settings to `.env.example`; reuse `AI_PROVIDER_*` for credentials/model (`gpt-4o-mini` fallback). Keep secrets out of logs and responses.

---

## Task 1: Extract the shared AI provider seam (TDD)

**Files:**

- Add `apps/backend/src/common/ai/ai-chat-provider.port.ts`.
- Add `apps/backend/src/common/ai/ai-provider.module.ts`.
- Move the adapter to `apps/backend/src/common/ai/openai-chat-provider.adapter.ts` (or keep the adapter beside the common module if the existing project convention requires an `infrastructure/` folder).
- Update `apps/backend/src/modules/copilot/copilot.module.ts`, Copilot imports/tests, and `apps/backend/src/modules/webhooks/webhooks.module.ts`.
- Update `apps/backend/.env.example` with `AI_MATCHING_ENABLED`, `AI_MATCHING_DAILY_LIMIT`, `AI_MATCHING_CONCURRENCY`, and `AI_MATCHING_TIMEOUT_MS`.

**Steps:**

1. Write/adjust the adapter contract test first. Assert that a configured adapter maps a required tool choice and an abort signal to the OpenAI client, while Copilot’s existing auto-tool behavior remains unchanged.
2. Move the existing port and adapter without changing Copilot behavior. Add optional `CreateChatCompletionOptions { signal?: AbortSignal; toolChoice?: 'auto' | 'required' | 'none' }` to both non-streaming/streaming methods so matching can require exactly one tool call; existing callers omit it.
3. Bind `AI_CHAT_PROVIDER` once in `AIProviderModule`, import that module from Copilot and Webhooks, and remove the Copilot-local provider binding. Do not create a second token or adapter.
4. Run the focused Copilot/provider tests and backend type-check before continuing.

**Verification:**

```bash
pnpm --filter @casso-ar/backend exec jest src/modules/copilot --runInBand
pnpm --filter @casso-ar/backend type-check
```

## Task 2: Add the recommendation value and JSONB persistence (TDD)

**Files:**

- Add `apps/backend/src/modules/webhooks/domain/ai-matching-recommendation.ts`.
- Modify `apps/backend/src/modules/webhooks/domain/bank-transaction.ts`.
- Modify `apps/backend/src/modules/webhooks/infrastructure/bank-transaction.orm-entity.ts` and `typeorm-bank-transaction.repository.ts`.
- Add `apps/backend/src/database/migrations/20260908000000-add-bank-transaction-ai-recommendation.ts` (use the next timestamp if the migration directory already contains a newer file).
- Add/update adjacent domain/migration tests.

**Steps:**

1. Add a pure domain test covering the allowed statuses, confidence range, candidate id/null rules, and sanitized reason length/control-character rules. Make the test fail before implementation.
2. Implement a typed `AiMatchingRecommendation` union/shape with `status`, nullable `recommendedReceivableId`, nullable `confidence`, nullable `reason`, `model`, `promptVersion`, `evaluatedAt`, and stable `failureCode`. `SUCCEEDED` requires an offered candidate and confidence 70–100; `ABSTAINED` has no candidate; `FAILED` has no candidate/confidence/reason. Keep `matching-v1` as the prompt version constant.
3. Add `aiRecommendation?: AiMatchingRecommendation | null` to `BankTransaction` construction with a `null` default so existing fixtures remain valid, and provide the smallest immutable setter needed by the webhook use case. Preserve the field in every status transition.
4. Add a nullable `jsonb` ORM column and explicit domain↔ORM mapping; do not cast domain objects to ORM entities.
5. Add an atomic up/down migration with no backfill, default, or index. Migration tests should assert the SQL shape/convention used by this repository.
6. Run the focused domain/repository tests and type-check.

**Verification:**

```bash
pnpm --filter @casso-ar/backend exec jest src/modules/webhooks/domain src/modules/webhooks/infrastructure --runInBand
pnpm --filter @casso-ar/backend type-check
```

## Task 3: Implement the fail-closed Redis guard (TDD)

**Files:**

- Add `apps/backend/src/modules/webhooks/application/ai-matching-guard.port.ts`.
- Add `apps/backend/src/modules/webhooks/infrastructure/redis-ai-matching-guard.ts` and its spec.
- Update `apps/backend/src/modules/webhooks/webhooks.module.ts`.

**Steps:**

1. Write tests against the public guard operation for: feature disabled, duplicate webhook lock (first wins), per-organization concurrency limit 2, daily attempt limit 100 in `Asia/Ho_Chi_Minh`, and Redis errors. The Redis-error case must return a skip result and never execute the provider callback.
2. Implement one guard service around the existing `RATE_LIMIT_REDIS_CLIENT`. Use a short per-webhook lock, an organization in-flight counter, and a day-keyed attempt counter. Acquire lock/concurrency/quota before a provider attempt; release counters/lock in `finally`. Use token-checked lock release so one worker cannot delete another worker’s lock. Keep any global worker cap inherited from BullMQ; do not add a second global semaphore. Add `ponytail:` comments only where a deliberately global Redis primitive has a documented upgrade ceiling.
3. Parse bounded env settings with safe defaults and fail closed for AI only. Register the guard through a symbol token; the deterministic webhook path must not depend on Redis availability.
4. Run the guard spec and type-check.

**Verification:**

```bash
pnpm --filter @casso-ar/backend exec jest src/modules/webhooks/infrastructure/redis-ai-matching-guard.spec.ts --runInBand
pnpm --filter @casso-ar/backend type-check
```

## Task 4: Build the strict matching recommendation service (TDD)

**Files:**

- Add `apps/backend/src/modules/webhooks/application/matching-ai-recommendation.service.ts` and spec.
- Add small local types/helpers beside the service only when they are used by this service.
- Update the common provider port/adapter tests if options were added in Task 1.

**Steps:**

1. Write service tests with a fake `IAIChatProvider` for: valid `C3` success at confidence 70, high-confidence success, `ABSTAIN`, candidate not in the offered set, malformed/multiple/no tool calls, timeout plus one transient retry, permanent provider failure, prompt masking/truncation, and reason sanitization. Assert no UUID/org/user/credential appears in messages.
2. Implement a public `evaluate(input)` application operation accepting the tenant/webhook identifiers, transaction fields, and the top five enriched deterministic candidates. Return a typed recommendation result or `null` when disabled/guard-skipped; do not expose provider-specific types to the domain.
3. Build a system prompt that states the data is untrusted evidence, forbids actions/tools/instructions, requires exactly one `matching_recommendation` tool call, and permits `ABSTAIN`. Build user JSON using only sanitized fields and aliases `C1`–`C5`.
4. Call `createChatCompletion` with one tool and `toolChoice: 'required'`, an `AbortController` timeout, and at most one retry for transient provider failures. Validate the returned tool call with type guards: exactly one call, known tool name, candidate either `C1`–`C5` or `ABSTAIN`, confidence integer 0–100, and `MATCH` confidence ≥70. Convert malformed/timeout/provider failures to stable `FAILED` codes; never throw into webhook processing.
5. Sanitize the reason to bounded plain text/control-character-free content, record model/prompt version/evaluated time internally, and emit structured redacted logs with organization/request context. Do not add an AI audit table or feedback loop.
6. Run the focused service tests and type-check.

**Verification:**

```bash
pnpm --filter @casso-ar/backend exec jest src/modules/webhooks/application/matching-ai-recommendation.service.spec.ts --runInBand
pnpm --filter @casso-ar/backend type-check
```

## Task 5: Wire AI into the webhook matching slice (TDD)

**Files:**

- Modify `apps/backend/src/modules/webhooks/application/matching-engine.service.ts` and its spec.
- Modify `apps/backend/src/modules/webhooks/application/process-webhook.usecase.ts` and its spec.
- Modify `apps/backend/src/modules/webhooks/webhooks.module.ts`.

**Steps:**

1. Add a failing matching-engine test proving the top five scored candidates carry only the non-persisted enrichment needed for AI (invoice number, customer name, due date, remaining amount) while candidate ORM writes still contain only the existing score fields. Preserve all existing score formulas and ordering.
2. Implement that enrichment from the data already loaded by `MatchingEngineService`; update candidate mapping explicitly rather than spreading AI-only fields into `MatchingCandidate`.
3. Add process-use-case tests proving: no provider call for `>=90`, `<60`, or feature-disabled; one guarded call for `60–89`; a `SUCCEEDED`/`ABSTAINED`/`FAILED` result is persisted with the pending transaction; guard/provider failure still saves deterministic candidates and leaves webhook processing successful; and the AI call occurs before the existing DB transaction.
4. Inject the recommendation service as the final dependency to minimize existing constructor churn. In the `60–89` branch, call it once with the top five enriched candidates, attach the returned recommendation to the domain transaction, mark `PENDING_REVIEW`, and save it in the same existing transaction as candidate rows. Leave auto-match and unmatched branches unchanged.
5. Ensure explicit reprocessing semantics: ordinary reads do nothing; a successful/abstained transaction is not re-evaluated; only the failed webhook reprocess path can retry a failed recommendation, and a rollback before persistence may naturally cause a new attempt.
6. Run the focused matching/process tests and type-check.

**Verification:**

```bash
pnpm --filter @casso-ar/backend exec jest src/modules/webhooks/application/matching-engine.service.spec.ts src/modules/webhooks/application/process-webhook.usecase.spec.ts --runInBand
pnpm --filter @casso-ar/backend type-check
```

## Task 6: Expose current/stale advisory data and correlate manual acceptance (TDD)

**Files:**

- Modify `apps/backend/src/modules/receivables/application/receivable-repository.port.ts` and `typeorm-receivable.repository.ts` with a tenant-scoped `findOpenByIds` batch method.
- Modify `apps/backend/src/modules/exception-queue/application/unmatched-bank-transactions-query.service.ts` and its specs.
- Modify `apps/backend/src/modules/exception-queue/presentation/dto/exception-queue-response.dto.ts` and controller response decorators if needed.
- Modify `apps/backend/src/modules/exception-queue/application/match-bank-transaction.usecase.ts`.
- Modify `apps/backend/src/common/audit/audit-context.ts` and `audit.interceptor.ts`, plus focused audit tests.

**Steps:**

1. Write query/API tests first: a pending row with a currently open recommended receivable returns `SUCCEEDED` plus `isCurrent: true`; a closed/missing/cross-tenant receivable returns the same immutable recommendation with `isCurrent: false`; `ABSTAINED`, `FAILED`, and null return no suggestion context; no read path invokes the provider.
2. Add `findOpenByIds` using one explicit-column, organization-scoped query. Batch the recommendation ids for the page so stale derivation is not N+1. Keep the recommendation attached to the transaction as history; `isCurrent` is response-time derived only.
3. Add a response class (file suffix `.dto.ts`) exposing only `status`, `recommendedReceivableId`, `confidence`, `reason`, and `isCurrent` on the existing unmatched response. Keep internal model/prompt/latency/failure fields out of HTTP and leave the candidates endpoint contract intact. Update Swagger decorators for the changed response.
4. Add an audit-context after-state patch hook. After manual allocation validation succeeds, pass the selected receivable ids and `aiAccepted = recommendation.status === 'SUCCEEDED' && allocations include the recommended id with a positive amount`; the interceptor merges/sanitizes this into the existing `PAYMENT_ALLOCATE` audit after-state. Do not change authorization or transaction locking.
5. Run the focused exception-queue/query/audit tests and type-check.

**Verification:**

```bash
pnpm --filter @casso-ar/backend exec jest src/modules/exception-queue src/common/audit --runInBand
pnpm --filter @casso-ar/backend type-check
```

## Task 7: Add display-only Exception Queue UI (TDD)

**Files:**

- Modify `apps/frontend/src/features/exceptions/types.ts`.
- Modify `apps/frontend/src/features/exceptions/pages/exceptions-page.tsx` and `components/split-match-dialog.tsx`.
- Update `apps/frontend/src/features/exceptions/pages/exceptions-page.spec.tsx` and `components/split-match-dialog.spec.tsx`.

**Steps:**

1. Add failing frontend tests for a current successful recommendation showing a qualitative `Vừa`/`Cao` badge and sanitized reason, stale recommendations being labeled stale/no suggestion, and abstained/failed/null recommendations showing a generic “AI không có gợi ý” message. Assert that amount fields remain empty and manual/split controls still work.
2. Add the `AiRecommendation` response type and optional field to `PendingReviewItem`. Keep API functions/hooks unchanged because they already deserialize the page response.
3. Render a small advisory badge/reason in the existing score cell and dialog. Pass the selected row’s recommendation into `SplitMatchDialog`; do not prefill allocations, add one-click acceptance, retry controls, or new permissions. Render reason as plain text.
4. Run the focused page/dialog tests and frontend type-check.

**Verification:**

```bash
pnpm --filter @casso-ar/frontend exec jest src/features/exceptions/pages/exceptions-page.spec.tsx src/features/exceptions/components/split-match-dialog.spec.tsx --runInBand
pnpm --filter @casso-ar/frontend type-check
```

## Task 8: End-to-end verification, review, and handoff

**Files:**

- Update `apps/backend/.env.example` if any bounded setting names changed.
- Add/update e2e fixtures only if the existing Exception Queue response contract requires it; never call a live provider.
- No feature-map update is required because issue #378 is not a `docs/wayfinder/feature-map.md` ticket.

**Steps:**

1. Run focused backend/frontend tests again after the final refactor, then the relevant full suites and `pnpm verify`. Run the repository domain-check skill and resolve every violation attributable to this change. Record the known pre-existing billing-period test failure separately if it remains.
2. Use `code-review` against fixed point `ddfc764d` (the approved design commit), with issue #378 and the design/plan as sources. Fix all blocking correctness, security, architecture, and spec gaps; do not broaden scope.
3. Use `verification-before-completion`: execute each fresh command that supports a claim and report exact pass/fail evidence. Confirm `git diff --check`, migration presence, no secrets, and clean intended working-tree diff.
4. Commit with `feat: add AI-assisted matching recommendations`, push `feat/ai-assisted-matching`, and prepare the PR body with `Closes #378` only after verification passes. Do not merge without user review.

**Verification:**

```bash
pnpm --filter @casso-ar/backend test
pnpm --filter @casso-ar/frontend test
pnpm verify
git diff --check
```
