# Casso Webhook V2 Implementation Plan

> **For agentic workers:** Implement this plan task-by-task with TDD and verify every claim with fresh commands before committing or opening the PR.

**Goal:** Replace the inbound Casso Flow `secure-token` comparison with strict Casso Webhook V2 signature verification while preserving the existing per-authorization secret and idempotent inbox flow.

**Architecture:** Keep account/authorization lookup and secret decryption in `ReceiveWebhookUseCase`; add one pure, dependency-free verifier that parses `X-Casso-Signature`, recursively sorts the complete webhook payload, computes HMAC-SHA512 over `timestamp.JSON(payload)`, and compares the hex digest constant-time. Keep `POST /v2/webhooks` registration and its documented `secure_token` request field unchanged; that value remains the V2 signing secret.

**Tech Stack:** NestJS, class-validator, TypeScript, Node `node:crypto`, Jest, Supertest.

**Spec:** `AGENTS.md`, approved Casso Webhook V2 requirements from the conversation, and Casso's official verification sample.

## Global Constraints

- Strict V2 only: accept `X-Casso-Signature`; do not fall back to `secure-token`.
- Invalid or missing signatures for a resolved connection throw `AppError(ErrorCode.UNAUTHORIZED)` and return HTTP 401.
- Do not impose a timestamp age window; the existing unique provider transaction ID remains the replay/idempotency control.
- Keep `encryptedSecureToken` and the existing `/v2/webhooks` registration request; no migration or new dependency.
- Preserve tenant resolution by account number and asynchronous inbox processing.
- Update tests before production code and observe the expected RED result for each behavior.

---

### Task 1: Add the pure Webhook V2 signature verifier

**Files:**
- Create: `apps/backend/src/modules/webhooks/application/casso-webhook-signature.ts`
- Test: `apps/backend/src/modules/webhooks/application/casso-webhook-signature.spec.ts`

**Interface:**

```ts
export function verifyCassoWebhookSignature(input: {
  payload: Record<string, unknown>;
  signatureHeader: string;
  secret: string;
}): boolean;
```

- [x] **Step 1: Write the failing tests** for the official signed payload, a tampered payload, and a malformed/missing signature header.
- [x] **Step 2: Run the focused spec** and confirm it fails because the verifier does not exist.
- [x] **Step 3: Implement the minimum verifier** using `createHmac('sha512', secret)`, recursive A–Z object-key sorting, the message format `${timestamp}.${JSON.stringify(sortedPayload)}`, strict `t=<digits>,v1=<hex>` parsing, and `equalsConstantTime`.
- [x] **Step 4: Run the focused spec** and confirm all verifier cases pass.

### Task 2: Wire strict V2 verification into the webhook endpoint

**Files:**
- Modify: `apps/backend/src/modules/webhooks/presentation/dto/balance-hook.dto.ts`
- Modify: `apps/backend/src/modules/webhooks/presentation/dto/balance-hook.dto.spec.ts`
- Modify: `apps/backend/src/modules/webhooks/presentation/webhooks.controller.ts`
- Modify: `apps/backend/src/modules/webhooks/presentation/webhooks.controller.spec.ts`
- Modify: `apps/backend/src/modules/webhooks/application/receive-webhook.usecase.ts`
- Modify: `apps/backend/src/modules/webhooks/application/receive-webhook.usecase.spec.ts`

- [x] **Step 1: Write failing tests** asserting the controller forwards `X-Casso-Signature`, the use case accepts a valid V2 signature, rejects an invalid signature with `UNAUTHORIZED`, and the DTO preserves all documented V2 fields under the global whitelist pipe.
- [x] **Step 2: Run the focused controller/use-case/DTO specs** and confirm they fail for the old header/secret comparison behavior.
- [x] **Step 3: Implement the smallest production change:** add all documented V2 fields to `BalanceHookDataDto`, read `x-casso-signature`, pass the complete payload to the use case, invoke the pure verifier after resolving the authorization secret, and throw `AppError` with `ErrorCode.UNAUTHORIZED` on missing or invalid signatures. Update Swagger error documentation and endpoint description.
- [x] **Step 4: Run the focused specs** and confirm they pass.

### Task 3: Update integration fixtures and verify the branch

**Files:**
- Modify: `apps/backend/test/casso-flow-bank-connection-flow.e2e-spec.ts`
- Modify: `apps/backend/test/webhook-matching.e2e-spec.ts`

- [x] **Step 1: Add a test-only signer/helper or fixed official vector** so integration requests send `X-Casso-Signature` without adding production signing code.
- [x] **Step 2: Run the affected e2e/integration tests** and confirm the V2 requests are accepted, duplicates remain idempotent, and invalid signatures are rejected.
- [x] **Step 3: Refactor only after green** to remove duplicated test signing setup while keeping behavior unchanged.
- [x] **Step 4:** Run fresh focused tests, backend type-check, `pnpm verify`, and the relevant e2e suites; run domain-check before completion.
- [x] **Step 5: Review the diff, commit with `fix: verify Casso webhook V2 signatures`, push `fix/casso-webhook-v2`, and open the PR against `feat/casso-flow-authorization`.
