# Cas ID Integration + Bank Connection Design

> Child spec of [docs/overview.md](../../../docs/overview.md), linked to [2026-08-03-webhook-matching-engine-design.md](2026-08-03-webhook-matching-engine-design.md) (each `BankTransaction` belongs to a `BankConnection`). Defines the Cas ID bank-account connection flow, the entities managing consent/tokens, and access-loss detection.

## 0. References & information limits

According to [cas.so/quickstart](https://cas.so/quickstart) (accessed 08/2026), Cas ID's actual technical flow is an **OAuth-style redirect-based flow**, not polling or webhooks as the initial brainstorm assumed:

```
1. POST /grant/token  (scopes e.g. "identity,transaction", redirectUri) → grantToken (expires in 30 minutes)
2. Open Cas Link with grantToken → user authenticates/scans a QR code in Cas Link
3. Cas Link redirects to redirectUri with publicToken in the query parameter
4. POST /grant/exchange (publicToken) → accessToken (does not expire)
5. accessToken can be invalidated via POST /grant/invalidate
```

API authentication uses the `x-client-id` + `x-secret-key` + API version headers, with separate sandbox and production environments.

**Limitations**: the public docs do not provide complete endpoint/response schemas or clearly describe a Cas ID webhook for access revocation. Field details, error codes, and the revoke-notification mechanism must be confirmed with the CASSO Developer Portal/Console before production deployment. This spec therefore uses an **adapter interface** to isolate the uncertain parts.

## 1. Adapter interface & connection flow

```
CasIdIntegrationAdapter (interface)
  createGrantToken(scopes, redirectUri): Promise<{ grantToken, expiresAt }>
  exchangeToken(publicToken): Promise<{ accessToken }>
  invalidateToken(accessToken): Promise<void>
  getAccountIdentity(accessToken): Promise<AccountIdentity>
  getTransactions(accessToken, ...): Promise<Transaction[]>   // fallback if pulling outside Balance Hook is needed

MockCasIdAdapter implements CasIdIntegrationAdapter   // mocks the entire flow, used for demo/test
CasIdAdapter implements CasIdIntegrationAdapter       // calls the real API, complete once Developer Portal access is available
```

`CasIdIntegrationAdapter` isolates the Accounts Receivable domain from the specific Cas ID API—if the actual API/flow differs from the assumption (for example, if an official webhook exists), only the `CasIdAdapter` implementation changes; domain logic does not.

### Connection flow

```
1. Owner clicks "Connect bank account" → BankConnectionService.initiate()
2. Call adapter.createGrantToken(scopes=["identity","transaction"], redirectUri=".../cas-id/callback")
3. Save CasIdConnectionSession (status PENDING_AUTHORIZATION), open Cas Link in a new popup/tab with grantToken
4. User scans a QR code / logs in within Cas Link
5. Cas Link redirects the popup to redirectUri with publicToken
6. The callback page (a dedicated AR Automation route, e.g. /bank-connections/cas-id/callback) receives publicToken,
   calls backend POST /bank-connections/cas-id/sessions/:id/exchange
7. Backend: adapter.exchangeToken(publicToken) → accessToken
8. Save BankConnection (status ACTIVE), encrypt accessToken at rest,
   close the popup, update the main connection-management page UI
```

Use a popup/new tab (not an iframe) because Cas Link is not confirmed to support iframe embedding; a popup plus a dedicated redirect URI is the standard OAuth-style model and is reliable.

## 2. Entities

```
CasIdConnectionSession
  id, organizationId, initiatedByUserId, grantToken, scopes,
  bankConnectionId (nullable — set when re-authenticating an existing connection),
  redirectUri, status (PENDING_AUTHORIZATION/COMPLETED/EXPIRED),
  expiresAt (createdAt + 30 minutes), createdAt

BankConnection
  id, organizationId, casIdConnectionSessionId,
  accessToken (encrypted at rest), accountIdentity (jsonb — account number, bank...),
  status (PENDING_AUTHORIZATION/ACTIVE/REQUIRES_REAUTHORIZATION/REVOKED/DISCONNECTED/ERROR),
  scopes, connectedAt, lastSyncAt, revokedAt,
  createdAt

ConnectionAuditEvent
  id, bankConnectionId, eventType (SESSION_CREATED/TOKEN_EXCHANGED/
    API_CALL_FAILED_401/MARKED_REQUIRES_REAUTH/RECONNECTED/DISCONNECTED),
  metadata (jsonb), createdAt
```

`accessToken` does not expire according to Cas ID, but remains the system's most sensitive credential (it can read transactions even though it is not an Internet Banking credential). It must be encrypted at rest and never logged in plaintext (including in `ConnectionAuditEvent.metadata`).

Link to the Webhook/Matching spec: each `BankTransaction` has a `bankConnectionId` referencing this entity (see section 2 of [2026-08-03-webhook-matching-engine-design.md](2026-08-03-webhook-matching-engine-design.md)).

## 3. Connection states & lazy revocation detection

### Transitions

```
PENDING_AUTHORIZATION → ACTIVE                    when token exchange succeeds
ACTIVE → REQUIRES_REAUTHORIZATION                 when any API call using accessToken returns 401/403
ACTIVE → ERROR                                    on other errors (5xx, network) — not a revoke, can retry
REQUIRES_REAUTHORIZATION → ACTIVE                 when the user completes the connection flow again; update the existing
                                                   BankConnection (do not create a parallel connection)
ACTIVE/REQUIRES_REAUTHORIZATION → DISCONNECTED    when the Owner actively disconnects (calls invalidateToken)
```

Because Cas ID does not publish a revocation webhook, detection of `REQUIRES_REAUTHORIZATION` uses **lazy detection**: any API call (receiving a Balance Hook, calling `getTransactions`, etc.) using `accessToken` that returns 401/403 immediately marks the connection—no separate scheduled polling job is needed. Detection may be delayed until the next API call.

Every adapter caller must use the shared handling path: catch `CasIdUnauthorizedError` (401/403), call `MarkRequiresReauthorizationUseCase` for the correct `bankConnectionId`, record a `ConnectionAuditEvent`, then rethrow so the caller/queue can retry under its own policy. Business use cases must not call the adapter directly and bypass this guard.

### Rules after leaving ACTIVE

- Do not delete existing historical `BankTransaction`/`PaymentAllocation` records when a connection is no longer ACTIVE.
- When `REQUIRES_REAUTHORIZATION` or `DISCONNECTED`, the Webhook Controller checks `BankConnection` status before enqueueing a new Balance Hook for that connection; if it is not ACTIVE, stop accepting new transactions.
- Notify the Organization Owner when the status leaves ACTIVE.
- Do not automatically substitute another account when a connection loses access.
- Record every status change in `ConnectionAuditEvent`.

## 4. Out of scope

- Actual Cas ID API endpoint/response schemas—confirm them with the Developer Portal before replacing `MockCasIdAdapter` with the real `CasIdAdapter`.
- A Cas ID account granting access to multiple tenants/apps simultaneously.
- RBAC/UI for a director authorizing an accountant inside the Cas ID app (outside AR Automation, which only receives `accountIdentity` after authorization completes).

## 5. Open questions (do not block implementation)

- Does the real API provide a revoke webhook/event, or must production also rely on lazy detection?
- Which actual Cas ID `scopes` exist besides the `"identity"` and `"transaction"` mentioned in the quickstart?
- Should an organization have a limit on concurrent `PENDING_AUTHORIZATION` sessions to prevent session-creation spam?
