# Real Cas ID Integration + Balance Hook Fix Design

> Follow-up to the Cas Link popup flow (PRs [#266](https://github.com/lengocanh2005it/casso-ledger/pull/266), [#268](https://github.com/lengocanh2005it/casso-ledger/pull/268)), which wired the frontend popup UX but left the backend talking to `MockCasIdAdapter`. Investigating why the popup couldn't complete a real consent flow surfaced two separate, unrelated gaps, bundled into one spec because both were found in the same investigation and both block "Cas ID actually works end to end": (A) no adapter ever calls the real Cas ID API, and (B) the webhook receiver that's supposed to ingest transactions after a connection is linked doesn't match Cas ID's real "Balance Hook" product at all. Reference implementation: `E:\xcash-ai` (sibling project, already integrates with the real Cas ID sandbox and has working tests).

## 1. Problem

**Part A.** `MockCasIdAdapter` (`apps/backend/src/modules/bank-connections/infrastructure/mock-cas-id.adapter.ts`) fabricates `grantToken`/`accessToken` values locally and never makes a network call. It was a reasonable placeholder before Cas ID Developer Portal access existed (see its own `// ponytail:` comment), but real credentials are now available. Pointing the Cas Link popup at the real hosted consent page (`dev.link.bankhub.dev`, fixed in PR #268) is useless if the `grantToken` it's given was never registered with Cas ID's real API — the sandbox will reject it.

**Part B.** `apps/backend/src/modules/webhooks/` implements a webhook receiver (`POST /api/v1/webhooks/casso-balance-hook`) that was modeled after an imagined generic "Casso" webhook, not Cas ID's actual **Balance Hook** product (https://cas.so/product/balance-hook). Two independent mismatches:
- **Auth**: the guard checks `x-client-id`/`x-secret-key` headers (copied from the *outbound* API-auth scheme); the real Balance Hook has no signature header at all — Cas identifies itself by source IP only.
- **Payload shape**: the DTO is flat (`bankConnectionId`, `counterpartyAccountNumber`, ...); the real payload is nested under `transaction`, keyed by `grantId`, and several fields are nullable.

If real transactions started arriving today, they'd be rejected at both layers.

## 2. Part A — Real `CasIdAdapter`

### 2.1 Scope

Implement `createGrantToken`, `exchangeToken`, `getAccountIdentity` for real. **Do not** implement `invalidateToken` (`POST /grant/invalidate`) or `getTransactions` (`GET /transactions`) — their request/response schemas are not in Cas ID's public docs (stub pages, confirmed via WebFetch on 2026-08-19), and guessing them risks silently breaking money-adjacent flows. Both keep `MockCasIdAdapter`'s current no-op/empty-array behavior, marked with a `// ponytail:` comment naming the gap and the upgrade path (confirm schema, then implement — do not guess).

### 2.2 Confirmed API surface

Cross-checked against xcash-ai's working `CasClientService` (`E:\xcash-ai\apps\backend\src\modules\cas\cas-client.service.ts`) and https://cas.so/quickstart / https://cas.so/general/api:

| Endpoint | Method | Purpose | Response fields (camelCase or snake_case — map both) |
|---|---|---|---|
| `/grant/token` | POST | Create a grant token for the Cas Link popup | `grantToken`/`grant_token`, `expiresAt`/`expires_at` (30 min validity) |
| `/grant/exchange` | POST | Exchange the popup's `publicToken` for an access token | `accessToken`/`access_token`, `grantId`/`grant_id` |
| `/identity` | GET | Fetch linked account identity | account/bank fields (map to `AccountIdentity`) |

Headers on every call: `x-client-id`, `x-secret-key` (from `CAS_ID_CLIENT_ID`/`CAS_ID_CLIENT_SECRET`), `X-BankHub-Api-Version: 2023-01-01`, `Content-Type: application/json` on POSTs; `/identity` additionally sends `Authorization: <accessToken>` (raw token, not `Bearer`-prefixed — matches xcash's `requestWithAccessToken`).

### 2.3 Port change: `exchangeToken` must also return `grantId`

`ICasIdIntegrationAdapter.exchangeToken` currently returns only `{ accessToken: string }`. Widen it to `{ accessToken: string; grantId: string }`. This is required by Part B (§3.3) — the Balance Hook payload only ever carries `grantId`, never `bankConnectionId`, so `grantId` must be persisted at exchange time to make later webhook deliveries resolvable. `MockCasIdAdapter` gets a matching fake `grantId` (same style as its existing fake `accessToken`).

### 2.4 HTTP conventions — mirror xcash-ai's `CasClientService`, not just its URLs

The user explicitly wants this adapter to follow xcash-ai's **tested** implementation, not a fresh guess at the same endpoints. Port two behaviors:

1. **Retry with backoff.** xcash's `withRetry` retries 429/502/503/504 up to 3 times, exponential backoff from 500ms. Nothing in this repo currently does this (`vietqr-tax-code-lookup.adapter.ts` fails fast instead), so it's new — implement as a private helper inside `cas-id.adapter.ts`.
2. **Response unwrapping / error mapping.** Mirror `unwrapCasPayload`/`extractCasErrorMessage`/`CasHttpError` — Cas sometimes wraps the real payload under a `data` key; error bodies vary in shape (`errorMessage`/`message`/`error`/`errorCode`).

On any 401/403, throw the existing `CasIdUnauthorizedError` (`cas-id-integration-adapter.port.ts`) — required for `MarkRequiresReauthorizationUseCase`'s existing error contract.

### 2.5 Open design question — deliberately deferred, not decided here

xcash-ai's `OnboardingService.handleBankingCallback` does **not** let a failed `GET /identity` call abort the whole grant-link: it catches, logs a warning, and still saves the connection with null account metadata (their Prisma schema allows `accountNumber: string | null`). Casso Ledger's `ExchangeTokenUseCase` currently aborts the entire exchange if `getAccountIdentity` throws, and `AccountIdentity` (`bank-connection.ts`) is non-nullable (`{ accountNumber: string; bankName: string }`), so there's nowhere to represent "identity temporarily missing" without widening the domain type + ORM column + a migration.

**Decision: do not make this change as part of this spec.** Keep `ExchangeTokenUseCase`'s current fail-fast behavior. Implementation must surface this gap explicitly (in the PR description or a follow-up issue) rather than silently adopting xcash's more lenient behavior — it's a real product/data-model decision (do we ever want a "connected but identity unknown" `BankConnection`?) that belongs to the user, not something to infer from a sibling codebase.

### 2.6 Config + DI wiring

- `.env.example`: add `CAS_ID_CLIENT_ID=`, `CAS_ID_CLIENT_SECRET=`, `CAS_ID_BASE_URL=https://sandbox.bankhub.dev` (documented in AGENTS.md's env table but missing from the actual file).
- `bank-connections.module.ts`: `CAS_ID_INTEGRATION_ADAPTER` provider becomes a `useFactory` — real `CasIdAdapter` when both `CAS_ID_CLIENT_ID` and `CAS_ID_CLIENT_SECRET` are set, else `MockCasIdAdapter`. Keeps every existing unit/e2e test (which never sets real credentials) unchanged.

## 3. Part B — Fix the Balance Hook webhook receiver

### 3.1 Real auth: source-IP allowlist, not a signature header

Per https://cas.so/general/api/webhook: Cas sends raw-JSON `POST`, no signature header, retries up to 17 times over 24h (Fibonacci backoff), identifies itself by a fixed sandbox IP (`20.2.69.168` — production IP(s) not found in public docs; implementation must ask rather than hardcode a guess).

`WebhookAuthGuard` (`apps/backend/src/modules/webhooks/presentation/webhook-auth.guard.ts`) is rewritten to check `req.ip` against a new fail-closed allowlist env var `CAS_ID_WEBHOOK_IP_ALLOWLIST`, mirroring the existing fail-closed pattern in `common/redirect-uri/allowlist.ts`. `docker-compose.yml` has no reverse-proxy service in front of the backend, so `req.ip` should be the true caller IP without `trust proxy` configuration — this assumption must be verified against `main.ts`/`configure-app.ts` before relying on it. `CASSO_WEBHOOK_CLIENT_ID`/`CASSO_WEBHOOK_SECRET_KEY` (the wrong scheme) are removed. The controller's Swagger doc comment ("Signed by Casso (X-Casso-Signature header)") is corrected to describe the real mechanism — it currently contradicts even the guard's own (also wrong) implementation.

### 3.2 Real payload shape

Verbatim example from https://cas.so/product/balance-hook:

```json
{
  "environment": "dev",
  "webhookType": "TRANSACTIONS",
  "webhookCode": "DEFAULT_UPDATE",
  "error": null,
  "grantId": "4c657924-13f3-11ee-a4bb-42010a40001b",
  "transaction": {
    "id": "3cacecf6935011ee952542010a400022",
    "transactionCode": "993UNdEHhIgfy3I",
    "reference": null,
    "transactionDate": "2023-12-05",
    "transactionDateTime": "2023-12-05T16:25:00+07:00",
    "bookingDate": "2023-12-05",
    "amount": 10000,
    "description": "test",
    "runningBalance": 3330000,
    "accountNumber": 867623232,
    "virtualAccountNumber": null,
    "virtualAccountName": null,
    "paymentChannel": null,
    "counterAccountNumber": null,
    "counterAccountName": null,
    "counterAccountBankId": null,
    "counterAccountBankName": null,
    "paymentMeta": null,
    "fiId": "3c26a8ed-efb5-11ed-8620-0ae7e48c82d8",
    "fiName": "VietinBank",
    "fiServiceId": "433f71c4-efb5-11ed-8620-0ae7e48c82d8",
    "fiServiceName": "VietinBank iPay - Official API",
    "currency": "VND"
  }
}
```

`counterAccountNumber`/`counterAccountName`/`description` are nullable — a real transaction won't always carry counterparty info (e.g. cash deposits).

`BalanceHookDto` is rewritten to this nested shape (`grantId` + a nested `transaction` DTO with `@ValidateNested`/`@Type(() => X)`, matching this codebase's existing nested-DTO convention). `normalizeBalanceHookPayload` (`transaction-normalizer.ts`) reads from `payload.transaction.*` and maps null/missing `description`/`counterAccountNumber`/`counterAccountName` to `''` instead of throwing `VALIDATION_ERROR`.

**No domain/DB change needed for nullability**: `payer-name-score.ts` and `customer-bank-account-score.ts` already return score `0` on empty-string input (verified by reading both files during this investigation), so `BankTransaction`'s existing non-nullable `string` fields stay as-is — `''` is a safe, already-handled sentinel. This was the key finding that kept this fix from also requiring a matching-engine rewrite + migration.

### 3.3 `grantId` → `BankConnection` resolution (new, currently absent)

The real payload has no `bankConnectionId` — only `grantId`. `ReceiveWebhookUseCase` currently requires `bankConnectionId` directly and the controller passes it straight from the (wrong) flat DTO. Fix:

- Persist `grantId` on `BankConnection` (domain + ORM column, unique + indexed, new migration) — sourced from Part A §2.3's widened `exchangeToken` result, set in `ExchangeTokenUseCase`.
- Add `findByGrantId(grantId): Promise<BankConnection | null>` to `IBankConnectionRepository` + TypeORM impl, unscoped (webhook delivery has no request tenant context yet — same justification already documented for `findByIdUnscoped`).
- `ReceiveWebhookInput` takes `grantId` instead of `bankConnectionId`; `ReceiveWebhookUseCase` does the `findByGrantId` lookup itself. Existing tenant-mismatch / `isUsable()` / duplicate-webhook / enqueue logic is unchanged.
- `WebhooksController.receiveBalanceHook` extracts `grantId` and `transaction.id` from the new DTO shape.

## 4. Out of scope (explicitly)

- `invalidateToken`/`getTransactions` real implementations (§2.1).
- Widening `AccountIdentity` to nullable / adopting xcash's identity-fetch resilience (§2.5) — flagged as a follow-up decision, not made here.
- Production Balance Hook source IP(s) — allowlist ships with only the confirmed sandbox IP; production IPs must be added once confirmed (ask, don't guess).
- Any frontend change — the Cas Link popup UX (PRs #266, #268) is already merged and unaffected by this backend-only work.

## 5. Testing

TDD throughout (RED→GREEN per AGENTS.md). New coverage needed: `CasIdAdapter` (mapping, retry, 401→`CasIdUnauthorizedError`, malformed response), DI factory selection, `WebhookAuthGuard` (IP allow/deny/fail-closed), `BalanceHookDto` validation against the real shape, `transaction-normalizer` (nested shape + null→`''`), `ReceiveWebhookUseCase` (grantId lookup), `ExchangeTokenUseCase` (grantId persisted), repository `findByGrantId`. Existing webhook e2e test needs its request body reshaped and auth headers replaced with an allowed source IP.
