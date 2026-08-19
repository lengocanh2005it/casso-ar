# Casso Flow Integration Design (replaces the Cas ID work)

> Supersedes the approach in [2026-08-19-cas-id-real-integration-design.md](2026-08-19-cas-id-real-integration-design.md) — that spec targeted Cas ID (cas.so/bankhub.dev), an Open Banking API unrelated to this product's actual bank data source. See [ADR-0021](../../adr/0021-casso-flow-not-cas-id-for-bank-integration.md) for why. Settled through a `brainstorming` + `domain-modeling` session; this doc records the decisions, not the exploration. Terminology: **Casso Flow** = the third-party provider (flow.casso.vn) this spec integrates with — see `CONTEXT.md`. Never bare "Casso"/"CASSO" for the third party; that term means this product.

## 1. Problem

Investigating why the merged Cas ID integration (PR #266/#268/#269) couldn't complete against real credentials revealed the whole thing targets the wrong provider. This product's real bank-data source is **Casso Flow**, a Vietnamese bank-aggregation SaaS with a fundamentally different integration model:

- **Cas ID's model** (what was built): this product drives an OAuth-style *bank-linking consent* popup — the business grants this product direct read access to their bank account, and this product becomes the thing holding that access.
- **Casso Flow's actual model**: the business links their bank account **directly on Casso Flow's own site** (flow.casso.vn), using their own Casso Flow account. This product never touches the bank account directly. What this product needs is narrower: read which account the business already linked (via Casso Flow's own OAuth2), register a webhook so Casso Flow forwards transaction events, and verify those events are really from Casso Flow.

Everything Cas ID-shaped is removed, not kept as a fallback (ADR-0021).

## 2. Domain model changes

Per `CONTEXT.md` (already updated):

- **`BankConnection`** now means: this product's authorization to read a Casso-Flow-linked account's info and receive its webhook — not "this product's own Open Banking grant." Fields:
  - `id`, `organizationId`
  - `accountNumber: string` — the bank account number Casso Flow reports for this connection (from `/v2/userInfo`). **Primary correlation key** for resolving inbound webhooks to an organization — unique per organization (one Casso Flow account linked per org, matching the existing one-active-connection-per-org constraint `hasActiveByOrganization` already enforces).
  - `bankName: string`
  - `encryptedSecureToken: string` — a random secret **this product generates** and registers with Casso Flow via `POST /v2/webhooks`; used to verify inbound webhook calls really come from Casso Flow for this organization. Not something Casso Flow hands back — this product picks the value.
  - `encryptedCassoAccessToken: string`, `encryptedCassoRefreshToken: string` — OAuth2 tokens from Casso Flow's `/auth/token`, needed for any future authenticated call to Casso Flow's API on this organization's behalf (e.g. the force-sync reconciliation call, §6).
  - `status: BankConnectionStatus` — same state machine shape as before (`PENDING_AUTHORIZATION → ACTIVE → REQUIRES_REAUTHORIZATION/ERROR → DISCONNECTED`), same triggers (`MarkRequiresReauthorizationUseCase` on a 401/403 from Casso Flow, same as it already handles for the old adapter).
  - `connectedAt`, `lastSyncAt`, `revokedAt`, `createdAt`.
  - Removed entirely: `casIdConnectionSessionId`, `grantId`, `encryptedAccessToken` (renamed/repurposed as above), `scopes` (Casso Flow's OAuth2 scope is fixed for this integration, not per-connection).
- **`CassoOAuthState`** (new, replaces `CasIdConnectionSession`) — short-lived, CSRF-protection record for the OAuth2 redirect round-trip only. Not a multi-step "grant session" — Casso Flow's flow is standard OAuth2 authorization-code, so all this needs to hold is: `id` (used as the `state` param), `organizationId`, `initiatedByUserId`, `expiresAt` (~10 minutes), `createdAt`. Deleted once consumed by the callback (or left to expire — no reuse, no status field, no `PENDING_AUTHORIZATION`-style machine needed since there's nothing in between "redirected" and "callback received").

## 3. Connection flow (Option B — OAuth2-automated, per user decision)

1. FE: "Connect Casso Flow" button → `POST /api/v1/bank-connections/casso-flow/initiate` → creates a `CassoOAuthState`, returns `{ authorizeUrl }` built as `https://oauth.casso.vn/auth/authorize?client_id=<CASSO_WEBHOOK_CLIENT_ID>&redirect_uri=<CASSO_FLOW_REDIRECT_URI>&response_type=code&state=<stateId>` (scope param TBD — confirm exact required scope value against Casso Flow's console/docs during implementation, do not guess a scope string).
2. FE opens this in a popup (same mechanical pattern as the removed Cas Link popup — `window.open` + `postMessage` back to the opener — but pointed at a different destination and for a different purpose; do not reuse any Cas-ID-named code, write it fresh under `casso-flow` naming).
3. Casso Flow's OAuth server redirects the popup to `redirect_uri` with `?code=...&state=...`.
4. Callback page posts `{ code, state }` back to the opener (or, if no `window.opener`, completes itself — same no-opener fallback reasoning as the removed Cas Link callback page, adapted).
5. Backend (`ExchangeCassoFlowConnectionUseCase` or similar — exact use-case name decided in the implementation plan): verify `state` matches an unexpired `CassoOAuthState` for the org; `POST https://oauth.casso.vn/auth/token` (form-encoded, `Authorization: Basic base64(CASSO_WEBHOOK_CLIENT_ID:CASSO_WEBHOOK_SECRET_KEY)`) to exchange `code` → `{ access_token, refresh_token }`.
6. `GET /v2/userInfo` (Bearer `access_token`) → `accountNumber`, `bankName`.
7. `POST https://oauth.casso.vn/v2/webhooks` (Bearer `access_token`) → register `{ webhook: <this product's shared webhook URL>, secure_token: <freshly generated random secret>, income_only: true }`.
8. Persist `BankConnection` (transaction: save connection + audit event, same shape as the removed `ExchangeTokenUseCase`'s transaction). Delete the consumed `CassoOAuthState`.

**Explicitly deferred to implementation, not designed here (verify empirically, do not guess):**
- The exact scope parameter for step 1.
- Whether the webhook Casso Flow actually delivers on registrations made via `POST /v2/webhooks` uses the `secure-token` header (legacy, simple string match) or `X-Casso-Signature` (HMAC, algorithm undocumented publicly) — register a real test webhook against Casso Flow with real credentials early in implementation and inspect what actually arrives, before writing the verification code. Whichever it is, verification MUST use `common/security/constant-time-compare.ts` (already exists, used by the code this replaces) for any direct string comparison — do not reintroduce `===` on secrets.

## 4. Webhook receiving flow

Endpoint stays `POST /api/v1/webhooks/casso-balance-hook` (already correctly named after Casso, not Cas ID — no rename needed). Payload shape, from Casso Flow's real docs (verbatim example):

```json
{
  "error": 0,
  "data": {
    "id": 0,
    "reference": "MA_GIAO_DICH_THU_NGHIEM",
    "description": "giao dich thu nghiem",
    "amount": 599000,
    "runningBalance": 25000000,
    "transactionDateTime": "2025-02-12 15:36:21",
    "accountNumber": "88888888",
    "bankName": "VPBank",
    "bankAbbreviation": "VPB",
    "virtualAccountNumber": "",
    "virtualAccountName": "",
    "counterAccountName": "NGUYEN VAN A",
    "counterAccountNumber": "8888888888",
    "counterAccountBankId": "970415",
    "counterAccountBankName": "VietinBank"
  }
}
```

Resolution changes from the Cas-ID-shaped "single lookup by `grantId`" to a **two-step resolve-then-verify** (§3.3 of the superseded spec's `grantId` design doesn't apply — this is a different mechanism, not a renamed one):

1. Parse `data.accountNumber` from the payload → `findByAccountNumber(accountNumber)` on `BankConnection` (new repository method, replaces `findByGrantId`; same unscoped-lookup justification as before — inbound webhooks have no request tenant context).
2. If no connection found → `{ received: true, ignored: true }` (same as the current no-match behavior).
3. Verify the request's webhook-auth header against **that connection's** `encryptedSecureToken` (decrypted, constant-time compared) — not a global secret, not an IP allowlist. `WebhookAuthGuard` can no longer be a stateless, DI-free guard the way the IP-allowlist version was (Task 12 of the superseded plan) — it now needs the resolved connection's per-org secret, so verification moves into `ReceiveWebhookUseCase` itself (which already loads the connection) rather than staying a pre-controller `CanActivate` guard with no data access. Remove `WebhookAuthGuard` as a route guard entirely; the controller no longer needs `@UseGuards(WebhookAuthGuard, ...)` for auth (keep `WebhookRateLimitGuard` for rate limiting, unrelated to this).
4. `transaction-normalizer.ts` maps `data.*` → the existing internal `NormalizedTransaction` shape: `providerTransactionId ← data.id`, `amount ← data.amount`, `transactionDateTime ← data.transactionDateTime` (note: Casso Flow's format is `"2025-02-12 15:36:21"`, not ISO 8601 with a `T`/timezone — confirm `new Date(...)` parses this correctly for the `Asia/Ho_Chi_Minh` timezone this product already standardizes on, or parse explicitly; do not assume `new Date()` handles it correctly without a test), `counterpartyAccountNumber ← data.counterAccountNumber`, `counterpartyName ← data.counterAccountName`, `transferContent ← data.description`. Same null-to-`''` tolerance as before for fields that can be empty strings (Casso Flow's example shows `""` not `null` for absent virtual-account fields — confirm whether `counterAccountNumber`/`counterAccountName`/`description` can also be `""` and handle both `""` and `null`/`undefined`, not just one).
5. Rest of the pipeline (dedup via `WebhookInbox` unique constraint, `MatchingEngineService`, `ProcessWebhookUseCase`) is unchanged — it never depended on the auth/resolution mechanism above it.

`BalanceHookDto` is rewritten to this flat `{ error: number; data: {...} }` shape (not the nested `transaction` object from the superseded Cas ID spec).

## 5. Removal list (everything Cas-ID-shaped, per ADR-0021)

- `apps/backend/src/modules/bank-connections/domain/cas-id-connection-session.ts` + its repository port/impl.
- `apps/backend/src/modules/bank-connections/infrastructure/cas-id.adapter.ts`, `mock-cas-id.adapter.ts`, `select-cas-id-adapter.ts`, and their specs.
- `apps/backend/src/modules/bank-connections/application/cas-id-integration-adapter.port.ts`, `initiate-connection.usecase.ts`, `exchange-token.usecase.ts` (replaced by Casso-Flow-named equivalents built fresh, not renamed-in-place, since the shape genuinely differs — e.g. no `grantToken`/`redirectUri`-with-embedded-`sessionId` concept, standard OAuth2 `state` instead).
- `bank_connections.grantId`/`casIdConnectionSessionId` columns — new migration to drop them and add `accountNumber`/`encryptedSecureToken`/`encryptedCassoAccessToken`/`encryptedCassoRefreshToken`. Per ADR-0021 and the prior spec's confirmed "no legacy production data," this can be a clean column drop/add, no data migration.
- Frontend: `apps/frontend/src/lib/cas-link.ts`, `features/bank-connections/pages/cas-id-callback-page.tsx`, `CasIdConnectionFlow` — replaced by freshly-named `casso-flow-*` equivalents implementing §3's flow.
- `.env.example`: remove `CAS_ID_CLIENT_ID`, `CAS_ID_CLIENT_SECRET`, `CAS_ID_BASE_URL`, `CAS_ID_REDIRECT_BASE_URL`, `CAS_ID_LINK_BASE_URL`, `CAS_ID_WEBHOOK_IP_ALLOWLIST`. Add `CASSO_WEBHOOK_CLIENT_ID`, `CASSO_WEBHOOK_SECRET_KEY` (already present, keep — now correctly understood as this product's Casso Flow OAuth2 client credentials, not a webhook-verification secret), `CASSO_FLOW_REDIRECT_URI`.
- `WebhookAuthGuard`, `common/webhook/ip-allowlist.ts` — removed per §4.3 (verification moves into the use case, keyed per-connection, not a stateless IP check).

## 6. Out of scope

- The force-sync reconciliation call (`POST /v2/sync`) — `SyncTransactionsUseCase` already exists for this purpose against the old port; wiring it to Casso Flow's real endpoint is a follow-up, not required for the core connect+receive flow this spec covers.
- Token refresh (`encryptedCassoRefreshToken` is persisted so a future refresh-on-401 flow is possible, but implementing that refresh flow is deferred — a 401 from Casso Flow's API today just marks the connection `REQUIRES_REAUTHORIZATION`, same as before, requiring the user to redo the OAuth popup rather than a silent refresh).
- Disconnect-side Casso Flow API calls (e.g. explicitly unregistering the webhook via a DELETE call) — `DisconnectConnectionUseCase` already calls `adapter.invalidateToken`; whether Casso Flow has a real unregister endpoint to wire there is a follow-up, not blocking.
- Manual-entry fallback (Option A) — not building it now per the user's explicit choice of Option B, but nothing in this design forecloses adding it later as an alternate connection path if Option B's OAuth2 integration proves unreliable.

## 7. Testing

TDD throughout. Given the auth/payload uncertainty flagged in §3/§4, the highest-value early test is an implementation-time manual verification against Casso Flow's real sandbox/account (register a real webhook, trigger a real or simulated transaction, capture the real request) — do this before finalizing `WebhookAuthGuard`'s replacement or `transaction-normalizer.ts`'s date parsing, not after. Unit/e2e coverage otherwise mirrors the shape of the superseded spec's Testing section (adapter mapping, DI/factory wiring if any survives from Casso-Flow-adjacent config, DTO validation, normalizer, use-case resolution, a round-trip e2e: initiate → OAuth callback → connection persisted with accountNumber+secureToken → simulated webhook → BankTransaction created).
