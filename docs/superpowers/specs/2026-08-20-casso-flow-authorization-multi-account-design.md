# Multi-account Casso Flow connections, API Key rotation, account holder name

> Settled through a `brainstorming` + `grilling` + `domain-modeling` session; this doc
> records the decisions, not the exploration. Domain model already committed to
> `CONTEXT.md` and [ADR-0022](../../adr/0022-cassoflowauthorization-splits-out-of-bankconnection.md).
> Terminology: **`CassoFlowAuthorization`** = this product's authorization to call Casso
> Flow's API with one API Key (one Casso Flow "business"). **`BankConnection`** = one
> linked bank account read through an authorization. Never conflate the two — see
> `CONTEXT.md`.

## 1. Problem

Three gaps, discovered while reviewing the existing single-account Casso Flow connect
flow:

1. **Account holder name never surfaces.** Casso Flow's real `/v2/userInfo` response
   includes `bankAccs[].bankAccountName` (confirmed against the fixture in
   `casso-flow.adapter.spec.ts`, captured from a live call); `CassoFlowAdapter.getAccountInfo`
   discards it.
2. **Only the first linked bank account is ever reachable.** `getAccountInfo` always reads
   `bankAccs[0]`. Casso Flow's own docs confirm one business can have more than one bank
   account linked (`docs/research/casso-flow-multi-account-api.md`) — sibling accounts are
   permanently unreachable through this product today, even by re-pasting the same key.
3. **No way to rotate a customer's API Key on an already-`ACTIVE` connection.** The only
   existing "give me a new key" entry point (`bankConnectionId` passed to `connect`) is
   gated to `REQUIRES_REAUTHORIZATION`/`ERROR` statuses (`BankConnection.reactivate()`);
   a healthy `ACTIVE` row has no path to accept a new key at all.

Also folded into this work (small, touches the same files):

4. `useConnectCassoFlow`'s generic `onError` toast fires *in addition to* the
   already-existing global `UpgradeDialog` (triggered by any `402` response) when the
   real cause is `PLAN_LIMIT_EXCEEDED` — misleadingly implies a bad API Key.

## 2. Domain model (already in `CONTEXT.md`/ADR-0022 — restated for reference)

- **`CassoFlowAuthorization`** — new entity. Owns `encryptedApiKey`, `encryptedSecureToken`
  (webhook-verification secret), `businessId: string | null` (Casso Flow's `data.business.id`,
  the correlation key for "is this pasted key the same business as an authorization we
  already have" — **nullable**: rows created by the migration backfill (§10) for
  pre-existing connections don't know their real `businessId`, since that value was never
  captured before this feature existed). One authorization → many `BankConnection`s.
  Fields: `id`, `organizationId`, `businessId`, `encryptedApiKey`, `encryptedSecureToken`, `createdAt`.
- **`BankConnection`** — gains `cassoFlowAuthorizationId: string` (**not** nullable post-migration
  — every connection has one, either from this feature's own connect/rotate flow or from
  the migration's backfill, §10) and `accountHolderName: string`. Loses
  `encryptedCassoApiKey`/`encryptedSecureToken` as owned fields (both move to the
  authorization; a connection reads them through its authorization, never stores its own
  copy).
- **`accountNumber` stays unique system-wide** (unchanged) — one bank account cannot be
  claimed by two organizations. This is what protects against two different orgs sharing
  the same real-world API Key (see §9) without needing a separate uniqueness rule on
  `CassoFlowAuthorization.businessId`.
- **No "legacy connection" case at runtime.** The migration (§10) backfills a
  `CassoFlowAuthorization` (with `businessId: null`) for every pre-existing
  `BankConnection`, so post-migration every connection has one — webhook delivery (§7)
  and the grouped "Đổi API Key" UI (§5.3) apply uniformly, no special-casing needed
  anywhere in application code for "a connection with no authorization." A backfilled
  authorization's `businessId` is populated the first time it's rotated (§5.1) — until
  then it cannot be recognized by `businessId` if the same real key is re-pasted through
  the top-level "Kết nối ngân hàng" flow instead of "Đổi API Key" (see §9).

## 3. `ICassoFlowIntegrationAdapter` — `getAccountInfo` returns the full list

```ts
export interface CassoFlowBankAccount {
  accountNumber: string;
  bankName: string;
  accountHolderName: string;
}

export interface CassoFlowAccountInfo {
  businessId: string;
  accounts: CassoFlowBankAccount[]; // bankAccs, in the order Casso Flow returned them
}

export interface ICassoFlowIntegrationAdapter {
  getAccountInfo(apiKey: string): Promise<CassoFlowAccountInfo>; // shape changed
  registerWebhook(apiKey: string, secureToken: string): Promise<void>; // unchanged
  invalidateToken(apiKey: string): Promise<void>; // unchanged (still a stub)
  getTransactions(apiKey: string): Promise<unknown[]>; // unchanged (still a stub)
}
```

`CassoFlowAdapter.getAccountInfo` changes: read `data.business.id` → `businessId`; map
**every** entry in `bankAccs` (not just `[0]`) to `{ accountNumber: bankSubAccId, bankName:
bank.fullName, accountHolderName: bankAccountName }`. Still throws if `bankAccs` is empty
(`'Casso Flow /v2/userInfo response has no linked bank account'` — unchanged message,
still means "no account linked at all", not "no account *selected*").

All 4 existing adapter callers (`ConnectCassoFlowUseCase`, the new preview/rotate use
cases, `SyncTransactionsUseCase`) must be updated for the new return shape — `getAccountInfo`
callers that only cared about the first account now explicitly pick `.accounts[0]` if
that's still what they need, rather than the adapter silently truncating for them.

## 4. Preview → confirm connect flow (new + first-time and adding accounts to an existing authorization)

Two endpoints, both under `POST /bank-connections/casso-flow/...`, both requiring
`Permission.BANK_CONNECTION_MANAGE`. Preview has no side effects (no DB writes, no
`registerWebhook` call) — only confirm does, and only confirm needs `Idempotency-Key`.

### 4.1 `POST /bank-connections/casso-flow/preview`

```ts
// Request
{ apiKey: string }

// Response
{
  businessId: string;
  accounts: Array<{
    accountNumber: string;
    bankName: string;
    accountHolderName: string;
    // ALREADY_CONNECTED: BankConnection exists in *this* org (any status)
    // TAKEN_BY_ANOTHER_ORG: accountNumber already used by a different org
    // AVAILABLE: free to connect
    status: 'ALREADY_CONNECTED' | 'TAKEN_BY_ANOTHER_ORG' | 'AVAILABLE';
  }>;
}
```

New usecase `PreviewCassoFlowAccountsUseCase`: calls `adapter.getAccountInfo(apiKey)` only
— no `registerWebhook`, no DB write. For each returned account, look up
`bankConnectionRepo.findByAccountNumber(accountNumber)` (existing, unscoped port method)
to classify status: no row → `AVAILABLE`; row with `organizationId === callerOrgId` →
`ALREADY_CONNECTED`; row with a different `organizationId` → `TAKEN_BY_ANOTHER_ORG`. Batch
these lookups (`IBankConnectionRepository.findByAccountNumbers(accountNumbers[])`, new
port method returning a `Map<accountNumber, BankConnection>`) — do not N+1 loop
`findByAccountNumber` per account (AGENTS.md perf rule).

### 4.2 `POST /bank-connections/casso-flow/confirm` (replaces today's `.../connect`)

```ts
// Request
{ apiKey: string, selectedAccountNumbers: string[] }

// Response
{
  connected: Array<{ connectionId: string; accountNumber: string }>;
  skipped: Array<{ accountNumber: string; reason: 'PLAN_LIMIT_EXCEEDED' | 'TAKEN_BY_ANOTHER_ORG' }>;
}
```

`ConnectCassoFlowUseCase` (rewritten):

1. `adapter.getAccountInfo(apiKey)` again (outside any transaction — re-verify, don't
   trust the client's earlier preview response for the actual accounts/businessId).
2. Filter to accounts whose `accountNumber` is in `selectedAccountNumbers` **and** whose
   number isn't `TAKEN_BY_ANOTHER_ORG` (re-check per §4.1's classification — cheap, same
   `findByAccountNumbers` call) — anything selected-but-taken goes straight into `skipped`
   with `TAKEN_BY_ANOTHER_ORG`, never attempted.
3. **If the filtered list from step 2 is empty, stop here** — return
   `{ connected: [], skipped }` immediately. Do **not** touch `CassoFlowAuthorization` or
   call `registerWebhook` for a request that ends up connecting nothing: two different
   orgs are able to paste the *same* real API Key (§9 — Casso's own trust model, not
   something this product polices), and if org B's entire selection turns out to already
   be `TAKEN_BY_ANOTHER_ORG` (claimed by org A), creating an org-B-scoped authorization and
   re-registering the webhook with a *new* secure token would silently break org A's
   already-working webhook delivery (Casso registers by business, not by org — the new
   token would replace the one org A's `ReceiveWebhookUseCase` still expects). Only step 4
   below is allowed to trigger authorization creation/`registerWebhook`, and only once it
   has committed to actually connecting at least one account.
4. Find-or-create the `CassoFlowAuthorization` for this org by `businessId`
   (`findByBusinessIdForOrganization` — new port method, **scoped to the calling org
   only**; a different org's authorization with the same `businessId` is irrelevant here,
   §9 covers that case). If none exists: `registerWebhook(apiKey, newSecureToken)` once,
   then persist a new authorization. If one exists: **do not** call `registerWebhook`
   again — the existing authorization's webhook registration already covers this key
   (calling `registerWebhook` again here is only correct for rotation — see §5 — not for
   "add one more account to an already-registered key").
5. In one transaction per remaining account (loop, not one giant transaction — §9's
   "partial success, no rollback of earlier successes" requirement): re-check
   `enforceBankConnectionLimit`; if over limit, add to `skipped` with
   `PLAN_LIMIT_EXCEEDED` and stop processing further accounts (once over the limit, every
   remaining one will be too — no point re-checking each). Otherwise create-or-reactivate
   the `BankConnection` (existing row for this `accountNumber` within this org, if any,
   via the new authorization vs. Casso's returned account info — reuse `.reactivate()` if
   the existing row isn't `ACTIVE`; skip with an internal error only if it's already
   `ACTIVE`, which `ALREADY_CONNECTED` filtering above should have already excluded)
   under the found-or-created authorization, with `accountHolderName`.
6. Audit event `TOKEN_EXCHANGED` per successfully connected account (same as today).

`bankConnectionId` param is removed from the connect DTO entirely — every "add a
connection" path now goes through account **selection**, not a specific row id (superseded
by §5's authorization-scoped rotate for the "fix a specific broken connection" case).

### 4.3 Frontend

- `ConnectDialog`/`CassoFlowConnectForm` become a 2-step flow: step 1 submits to
  `preview`, renders a checkbox list (pre-ticking `AVAILABLE` accounts, disabling
  `TAKEN_BY_ANOTHER_ORG` rows with an explanatory label, showing `ALREADY_CONNECTED` rows
  as already-checked-and-disabled informational rows); step 2 submits ticked
  `AVAILABLE`/pre-existing-but-still-selectable accounts to `confirm`.
- Reuse the existing API-Key `Input` + show/hide-toggle markup (extract into a small
  shared `ApiKeyInput` component — used by both this dialog and §5's rotate dialog,
  avoiding duplicating the eye-icon toggle).
- On a `confirm` response with any `skipped` entries: show which accounts didn't connect
  and why (`PLAN_LIMIT_EXCEEDED` accounts trigger the existing `UpgradeDialog` per §8;
  `TAKEN_BY_ANOTHER_ORG` accounts get an inline message, no dialog).

## 5. Rotate flow ("Đổi API Key") — authorization-scoped

### 5.1 `POST /bank-connections/authorizations/:id/casso-flow/preview`

Same shape/behavior as §4.1's preview, plus: reject early (`AppError(CONFLICT)`, detail
`rowErrorCode: 'BUSINESS_ID_MISMATCH'`) if the new key's `businessId` doesn't match the
target authorization's stored `businessId` — a materially different business, not the same
one with a new key. Message: "Mã doanh nghiệp từ API Key mới không khớp với liên kết hiện
tại. Dùng nút \"Kết nối ngân hàng\" nếu muốn thêm một liên kết mới." **Exception:** if the
target authorization's `businessId` is currently `null` (a migration-backfilled row that
has never been rotated, §10), skip the mismatch check entirely and adopt the new key's
`businessId` as this authorization's permanent value — this is the one-time self-heal that
lets a backfilled authorization become recognizable by `businessId` for future re-pastes
(§9).

Preview response additionally flags, among the target authorization's *current*
`BankConnection`s, any whose `accountNumber` is **absent** from the new key's account
list — the FE shows these as "không tìm thấy trong API Key mới, sẽ giữ nguyên trạng thái
hiện tại" (informational only, never auto-disconnected — per the earlier decision).

### 5.2 `POST /bank-connections/authorizations/:id/casso-flow/confirm`

New usecase `RotateCassoFlowAuthorizationUseCase`:

1. `findByIdForUpdate`-equivalent lock on the `CassoFlowAuthorization` row (new repo
   method, org-scoped via `TenantContextService` same as `BankConnection`'s
   `findByIdForUpdate`).
2. Re-verify `businessId` match (same check as preview, defense in depth).
3. `registerWebhook(newApiKey, newSecureToken)` once (a fresh secure token — do not reuse
   the old one, this is a real rotation of the credential Casso Flow will send back).
4. For every account in the new key's response that matches an *existing* `BankConnection`
   under this authorization (`accountNumber` match): new domain method
   `BankConnection.rotateApiKey()` — allowed only from `status === 'ACTIVE'` (throws
   otherwise, mirroring `reactivate()`'s guard style), updates `accountHolderName`/`bankName`
   if changed, does **not** change `status`/`connectedAt`. Audit event `API_KEY_ROTATED`
   (new `ConnectionAuditEventType` value) per updated row.
5. Update the authorization's `encryptedApiKey`/`encryptedSecureToken` to the new values.
6. Accounts from the new key's response **not** already connected under this
   authorization: returned in the response as `newlyDiscovered` for the FE to optionally
   send through §4's selection-based confirm as a follow-up action — rotate itself never
   auto-connects them.
7. Accounts previously connected under this authorization but absent from the new
   response: left untouched (no domain call at all).

`BankConnection.reactivate()` (existing method) also changes signature — it currently
takes `{ accountNumber, bankName, encryptedSecureToken, encryptedCassoApiKey }`, but the
latter two no longer exist on `BankConnection` at all post-split:

```ts
reactivate(input: {
  accountNumber: string;
  bankName: string;
  accountHolderName: string;
  cassoFlowAuthorizationId: string;
}): BankConnection {
  if (this.status !== 'REQUIRES_REAUTHORIZATION' && this.status !== 'ERROR') {
    throw new Error(`Cannot reactivate a connection in status ${this.status}`);
  }
  return new BankConnection({
    ...this,
    ...input,
    status: 'ACTIVE',
    connectedAt: new Date(),
    revokedAt: null,
  });
}
```

`BankConnection.rotateApiKey()` (new domain method, `bank-connection.ts`):

```ts
rotateApiKey(input: { bankName: string; accountHolderName: string }): BankConnection {
  if (this.status !== 'ACTIVE') {
    throw new Error(`Cannot rotate the API Key of a connection in status ${this.status}`);
  }
  return new BankConnection({ ...this, ...input });
}
```

(No `accountNumber` param — §5.1/§5.2's matching is by `accountNumber`, so a call site that
reaches this method already knows the number didn't change; only the mutable descriptive
fields update.)

### 5.3 Frontend

- Connections table groups rows by `cassoFlowAuthorizationId` (every row has one, §10). One
  "Đổi API Key" button per group (not per row). Reuses the same 2-step preview/confirm
  dialog shape as §4.3, entered via the group's button instead of the page-level "Kết nối
  ngân hàng" button, hitting the `:id/...` endpoints instead.

## 6. Disconnect changes

`DisconnectConnectionUseCase`:

- Stops calling `adapter.invalidateToken` unconditionally. After locking and disconnecting
  the target `BankConnection`, check (inside the same transaction) whether any other
  `BankConnection` still references the same `cassoFlowAuthorizationId` with a non
  -`DISCONNECTED` status. If any remain, no `invalidateToken` call. If the disconnected row
  **was** the last active one under its authorization, call `invalidateToken` with that
  authorization's decrypted API Key —
  outside the transaction, same "external call stays outside the transaction, only DB
  writes are wrapped" pattern already used elsewhere in this module. A failure here still
  follows the existing `markRequiresReauthorization.handleAdapterError` path (unaffected
  by this change).
- New port method needed: `IBankConnectionRepository.countActiveByAuthorization(cassoFlowAuthorizationId, manager)`.

## 7. Webhook receiving changes

`ReceiveWebhookUseCase`: after `findByAccountNumber`, decrypt/compare `webhookSecret`
against `connection.cassoFlowAuthorizationId`'s `encryptedSecureToken` (new repo lookup,
`ICassoFlowAuthorizationRepository.findById`) instead of a column on `connection` (which no
longer exists once this ships). Every connection has an authorization post-migration (§10),
so this lookup never needs a null-authorization fallback.

## 8. Frontend: stop double-messaging on `PLAN_LIMIT_EXCEEDED`

`useConnectCassoFlow`'s (→ split into preview/confirm mutations per §4.3) `onError`: check
`getApiErrorCode(error) === 'PLAN_LIMIT_EXCEEDED'` — if so, skip the generic toast (the
global `UpgradeDialog`, already listening for any `402`, already tells the user what
happened). Keep the generic toast for every other error code.

## 9. Explicitly out of scope / deferred

- **Cross-org `businessId` reuse beyond what `accountNumber` uniqueness already blocks.**
  If two different orgs paste the same real Casso Flow API Key, `accountNumber`'s existing
  system-wide uniqueness stops the second org's confirm from creating a colliding
  `BankConnection` — surfaced as `TAKEN_BY_ANOTHER_ORG` in preview. No separate uniqueness
  constraint on `CassoFlowAuthorization.businessId` is added; two orgs can each hold an
  authorization row with the same `businessId` value (harmless — they're never compared
  against each other, only used for a given org's own re-paste recognition, §4.2 step 3).
- **Propagating a 401 from a shared key to every sibling `BankConnection` under the same
  authorization.** Currently only `SyncTransactionsUseCase`/`DisconnectConnectionUseCase`
  call `handleAdapterError`, and both `getTransactions`/`invalidateToken` are still no-op
  stubs (ADR-0021-era `ponytail` notes) that never throw `CassoFlowUnauthorizedError` in
  production today. Once either is actually implemented, a 401 there logically means the
  *whole authorization's* key is dead, not just the one connection being synced/disconnected
  — but that's a change to `MarkRequiresReauthorizationUseCase`'s scope, not something this
  feature needs to solve for dead code paths. Flag this explicitly for whoever implements
  real `getTransactions`/`invalidateToken` later.
- **Rescan as a separate feature/button.** Folded into "Đổi API Key" per Q6 of the grilling
  session — re-pasting the *same* key through rotate already surfaces newly-discovered
  accounts (§5.2 step 6).
- **A "don't allow disconnecting the last connection" guard.** Explicitly decided against —
  the existing `/onboarding` redirect on `bankingLinked: false` is accepted behavior.
- **A backfilled authorization's `businessId: null` window.** Between migration and its
  first rotate (§5.1's self-heal), a backfilled authorization cannot be recognized by
  `businessId`. If the org re-pastes that same real key through the top-level "Kết nối
  ngân hàng" flow (§4) instead of "Đổi API Key" (§5) during that window, `findByBusinessIdForOrganization`
  won't match the backfilled row (`businessId: null` ≠ the real value) and will create a
  second, redundant authorization + re-register the webhook with a new secret — silently
  breaking the backfilled authorization's webhook delivery (self-inflicted, scoped to the
  org's own data, not the cross-org case above). Not fixed here; the practical mitigation
  is "Đổi API Key" existing as the correct, obvious entry point once accounts are already
  listed in the grouped UI (§5.3) — a user re-pasting a key for an account they can already
  see in the table has no reason to use the top-level button instead.

## 10. Migration

One migration, in this order:

1. Create `casso_flow_authorizations` (`id` uuid PK, `organizationId`,
   `businessId character varying NULL`, `encryptedApiKey` text, `encryptedSecureToken`
   text, `createdAt timestamptz`).
2. Add `bank_connections.cassoFlowAuthorizationId` as **nullable** for now (it becomes
   `NOT NULL` only after step 4 fills every row — a single migration can't add a
   `NOT NULL` column and backfill it in the same `ALTER TABLE`).
3. Add `bank_connections.accountHolderName character varying NOT NULL DEFAULT ''`.
4. **Backfill:** for every existing `BankConnection` row, `INSERT` one
   `CassoFlowAuthorization` (`businessId: NULL`, `encryptedApiKey`/`encryptedSecureToken`
   copied verbatim from that connection's existing columns — no re-encryption, same
   encryption key/scheme, straight copy), then `UPDATE` that connection's
   `cassoFlowAuthorizationId` to the new row's `id`. One authorization per connection
   (not deduplicated by shared key value) — a business that legitimately had two Casso
   Flow accounts connected as two separate `BankConnection` rows before this feature
   existed gets two separate backfilled authorizations, each with `businessId: NULL`; the
   first one rotated (§5.1) claims the real `businessId`, and rotating the other later hits
   §5.1's mismatch check normally (it's a materially different authorization row, correctly
   rejected if the same key is pasted into both — an existing-data edge case, not a bug,
   flagged here so it isn't mistaken for one during implementation).
5. Alter `bank_connections.cassoFlowAuthorizationId` to `NOT NULL` (step 4 guarantees every
   row now has one) and add the FK constraint (no `ON DELETE CASCADE` — an authorization
   is never hard-deleted by this feature, so the constraint is defensive only).
6. Drop `bank_connections.encryptedCassoApiKey`/`encryptedSecureToken` — by this point
   every value has already been copied into `casso_flow_authorizations` (step 4).

This must run after confirming no other code path still reads
`BankConnection.encryptedCassoApiKey`/`encryptedSecureToken` directly (§3, §6, §7 list
every call site that needs updating first) — step 6 is irreversible.
