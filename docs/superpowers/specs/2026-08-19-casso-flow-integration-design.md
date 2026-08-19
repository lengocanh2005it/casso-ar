# Casso Flow Integration Design (replaces the Cas ID work)

> Supersedes the approach in [2026-08-19-cas-id-real-integration-design.md](2026-08-19-cas-id-real-integration-design.md) — that spec targeted Cas ID (cas.so/bankhub.dev), an Open Banking API unrelated to this product's actual bank data source. See [ADR-0021](../../adr/0021-casso-flow-not-cas-id-for-bank-integration.md) for why. Settled through a `brainstorming` + `domain-modeling` session; this doc records the decisions, not the exploration. Terminology: **Casso Flow** = the third-party provider (flow.casso.vn) this spec integrates with — see `CONTEXT.md`. Never bare "Casso"/"CASSO" for the third party; that term means this product.

## 1. Problem

Investigating why the merged Cas ID integration (PR #266/#268/#269) couldn't complete against real credentials revealed the whole thing targets the wrong provider. This product's real bank-data source is **Casso Flow**, a Vietnamese bank-aggregation SaaS with a fundamentally different integration model:

- **Cas ID's model** (what was built): this product drives an OAuth-style *bank-linking consent* popup — the business grants this product direct read access to their bank account, and this product becomes the thing holding that access.
- **Casso Flow's actual model**: the business links their bank account **directly on Casso Flow's own site** (flow.casso.vn), using their own Casso Flow account. This product never touches the bank account directly. What this product needs is narrower: read which account the business already linked (via a Casso API Key the business pastes in — Casso Flow's OAuth2 partner-app registration is permanently closed, see §3), register a webhook so Casso Flow forwards transaction events, and verify those events are really from Casso Flow.

Everything Cas ID-shaped is removed, not kept as a fallback (ADR-0021).

## 2. Domain model changes

Per `CONTEXT.md` (already updated):

- **`BankConnection`** now means: this product's authorization to read a Casso-Flow-linked account's info and receive its webhook — not "this product's own Open Banking grant." Fields:
  - `id`, `organizationId`
  - `accountNumber: string` — the bank account number Casso Flow reports for this connection (from `/v2/userInfo`). **Primary correlation key** for resolving inbound webhooks to an organization — unique per organization (one Casso Flow account linked per org, matching the existing one-active-connection-per-org constraint `hasActiveByOrganization` already enforces).
  - `bankName: string`
  - `encryptedSecureToken: string` — a random secret **this product generates** and registers with Casso Flow via `POST /v2/webhooks`; used to verify inbound webhook calls really come from Casso Flow for this organization. Not something Casso Flow hands back — this product picks the value.
  - `encryptedCassoApiKey: string` — the organization's own Casso API Key, pasted by the user (§3) and encrypted at rest. Casso API Keys do not expire (per Casso's docs) and authenticate every subsequent call this product makes to Casso Flow's API on that organization's behalf (e.g. the force-sync reconciliation call, §6) — a single static credential, not an OAuth2 access/refresh token pair.
  - `status: BankConnectionStatus` — same state machine shape as before (`PENDING_AUTHORIZATION → ACTIVE → REQUIRES_REAUTHORIZATION/ERROR → DISCONNECTED`), same triggers (`MarkRequiresReauthorizationUseCase` on a 401/403 from Casso Flow, same as it already handles for the old adapter) — a 401 now most likely means the pasted API Key was revoked/deleted on Casso's side, not an expired token.
  - `connectedAt`, `lastSyncAt`, `revokedAt`, `createdAt`.
  - Removed entirely: `casIdConnectionSessionId`, `grantId`, `encryptedAccessToken` (renamed/repurposed as above), `scopes`.
- **No `CassoOAuthState` entity.** §3's revision (below) removes the OAuth2 redirect round-trip entirely, so there is nothing to protect against CSRF across a redirect — the connect call is a normal same-origin authenticated POST, covered by this product's existing auth/session handling. Do not build this entity.

## 3. Connection flow — revised: pasted API Key, not OAuth2 (supersedes this doc's original §3)

**Why this changed:** the original design (Option B, OAuth2-automated) assumed a partner app could self-register `client_id`/`client_secret` with Casso Flow via `POST /auth/token`. Checked during implementation planning: Casso's own app-registration form (the only way to obtain OAuth2 partner credentials) is now permanently closed, with this message shown in place of the form: *"Hiện tính năng này đã đóng, quý khách vui lòng sử dụng API Keys trong tài khoản Casso để kết nối."* ("This feature is now closed, please use API Keys in your Casso account to connect instead.") OAuth2 is not an option for a new integration. Casso's replacement mechanism, confirmed against `developer.casso.vn/casso-api/chung-thuc/tao-api-key-thu-cong`: each Casso account can generate a single, non-expiring **API Key** string (Settings → API Keys → Create API Key), used as `Authorization: Apikey <key>` on any Casso API call in place of an OAuth2 access token — confirmed interchangeable for `/v2/userInfo` and `/v2/webhooks` specifically.

This also retroactively explains `CASSO_WEBHOOK_CLIENT_ID`/`CASSO_WEBHOOK_SECRET_KEY` (the two real credential values already in this product's `.env`): a Casso API Key is a single string, not a client_id+secret pair, so these two values are **not** Casso Flow API credentials of any kind this connection flow uses — they most plausibly belong to the *inbound* webhook auth scheme this product's original scaffold already had (`x-client-id`/`x-secret-key` headers), a hypothesis from earlier investigation that was never confirmed and is **not** relied on by this revision either (§4 still uses the per-connection `secure_token` scheme). Do not reuse these two env vars for anything in this task; they are out of scope for this connect flow entirely. If they turn out to matter for something else, that is a separate, future investigation.

Revised flow — no popup, no redirect, no OAuth2, no `CassoOAuthState`:

1. FE: a form (in `ConnectDialog`, replacing the old "Connect" button) with one input — "Casso API Key" — and a short instruction telling the user where to get it on Casso's own site (Settings → API Keys). The user creates the key on Casso Flow themselves and pastes it in.
2. FE submits `POST /api/v1/bank-connections/casso-flow/connect` with `{ apiKey: string, bankConnectionId?: string }` (the latter only for the reconnect case, §17 of the plan).
3. Backend (`ConnectCassoFlowUseCase` — replaces both `InitiateCassoFlowConnectionUseCase` and `ExchangeCassoFlowConnectionUseCase`; there is no multi-step round trip left to split across two use cases):
   - `GET /v2/userInfo` with `Authorization: Apikey <apiKey>` → `accountNumber`, `bankName`. A non-2xx here (invalid/revoked key) surfaces as a validation-style error back to the form immediately — no async popup-failure UX needed, it's a synchronous form submission.
   - Generate a random `secure_token`; `POST /v2/webhooks` with the same `Authorization: Apikey <apiKey>` header → register `{ webhook: <this product's shared webhook URL>, secure_token, income_only: true }`.
   - Persist `BankConnection` in one transaction (create or `reactivate()`, same branching the removed `ExchangeTokenUseCase` used): `accountNumber`, `bankName`, `encryptedSecureToken`, `encryptedCassoApiKey` (the pasted key, encrypted — needed for any later API call, e.g. force-sync), `status: 'ACTIVE'`.

**Explicitly deferred to implementation, not designed here (verify empirically, do not guess):**
- Whether the webhook Casso Flow actually delivers on registrations made via `POST /v2/webhooks` uses the `secure-token` header (legacy, simple string match) or `X-Casso-Signature` (HMAC, algorithm undocumented publicly) — register a real test webhook against Casso Flow with the real API Key early in implementation and inspect what actually arrives, before writing the verification code. Whichever it is, verification MUST use `common/security/constant-time-compare.ts` (already exists) for any direct string comparison — do not reintroduce `===` on secrets.

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
- Frontend: `apps/frontend/src/lib/cas-link.ts`, `features/bank-connections/pages/cas-id-callback-page.tsx`, `CasIdConnectionFlow` — all deleted, **no replacement popup/callback-page equivalent** (§3's revision needs neither — see the plan's revised Task 15-17). Only a plain form input replaces them.
- `.env.example`: remove `CAS_ID_CLIENT_ID`, `CAS_ID_CLIENT_SECRET`, `CAS_ID_BASE_URL`, `CAS_ID_REDIRECT_BASE_URL`, `CAS_ID_LINK_BASE_URL`, `CAS_ID_WEBHOOK_IP_ALLOWLIST`. No Casso Flow env vars are needed for the connect flow itself (§3's revision) — the API Key is per-organization, supplied through the UI and stored on `BankConnection`, not read from `process.env`. `CASSO_WEBHOOK_CLIENT_ID`/`CASSO_WEBHOOK_SECRET_KEY` stay in `.env.example` undisturbed (out of scope for this task per §3's note — do not delete or repurpose them without a separate, confirmed reason).
- `WebhookAuthGuard`, `common/webhook/ip-allowlist.ts` — removed per §4.3 (verification moves into the use case, keyed per-connection, not a stateless IP check).

## 6. Out of scope

- The force-sync reconciliation call (`POST /v2/sync`) — `SyncTransactionsUseCase` already exists for this purpose against the old port; wiring it to Casso Flow's real endpoint (using `encryptedCassoApiKey`) is a follow-up, not required for the core connect+receive flow this spec covers.
- Disconnect-side Casso Flow API calls (e.g. explicitly unregistering the webhook via a DELETE call) — `DisconnectConnectionUseCase` already calls `adapter.invalidateToken`; whether Casso Flow has a real unregister endpoint to wire there is a follow-up, not blocking.
- Detecting/handling a Casso API Key the user revoked on Casso's own site — surfaces today only as a 401 on the next Casso Flow API call this product makes (`markRequiresReauthorization`'s existing handling), same posture as any other adapter failure. No proactive key-validity check is built.

## 7. Testing

TDD throughout. Given the auth/payload uncertainty flagged in §3/§4, the highest-value early test is an implementation-time manual verification against Casso Flow's real API using a real, freshly-created API Key (register a real webhook, trigger a real or simulated transaction, capture the real request) — do this before finalizing the webhook-auth-header assumption or `transaction-normalizer.ts`'s date parsing, not after. Unit/e2e coverage otherwise mirrors the shape of the superseded Cas ID spec's Testing section (adapter mapping, DTO validation, normalizer, use-case resolution, a round-trip e2e: connect with a test API Key → connection persisted with accountNumber+secureToken → simulated webhook → BankTransaction created). Because there is no multi-step redirect flow left, this round-trip e2e can now cover meaningfully more than the OAuth2 version could (no CI-network problem for the connect step itself, only `CassoFlowAdapter`'s real HTTP calls still need mocking, same as any other adapter test).
