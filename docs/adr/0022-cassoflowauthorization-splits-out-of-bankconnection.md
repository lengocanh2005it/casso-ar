# Split `CassoFlowAuthorization` out of `BankConnection` to model one API Key covering multiple bank accounts

**Status:** accepted

`BankConnection` (ADR-0021) originally modeled "this product's authorization to read a
Casso-Flow-linked account's info and receive its webhook" as one flat row per bank
account, each owning its own copy of the encrypted API Key and webhook-verification
secret. Investigating Casso Flow's real API (`GET /v2/userInfo`) confirmed a business can
link more than one bank account to a single API Key/"business" (`data.bankAccs` is
documented as a variable-length array, not always length 1) — a scenario this product
needs to support (import several bank accounts from one pasted key; let a customer rotate
that key without re-entering it once per account). `CassoFlowAuthorization` now owns the
API Key and webhook secret once per Casso Flow business (`businessId` is the correlation
key that recognizes a re-pasted key as the same authorization instead of duplicating it);
`BankConnection` keeps the per-account state and gains a nullable `cassoFlowAuthorizationId`.

## Considered Options

- **Keep `BankConnection` flat, duplicate the API Key/secret per row** (rejected): the
  simpler schema, but `registerWebhook(apiKey, secureToken)` is already a business-scoped
  Casso Flow call, not an account-scoped one — storing N independent copies of the same
  key/secret across N sibling accounts would mean registering the same webhook URL N times
  with N different secrets, none of which Casso Flow's API models as distinct. It would
  also leave "rotate the key" with no natural home: rotating one row's copy wouldn't imply
  anything about its siblings, even though they share the same real-world credential.
- **Model authorization state as fields on `BankConnection` itself (a `businessId` column
  + a boolean "is this the primary row"), instead of a separate table** (rejected): avoids
  a migration, but produces an ownership tie-break with no natural answer (which sibling
  row is "primary" when the first-connected one gets disconnected?) and still can't
  express "one webhook secret shared by N rows" without a self-referencing FK — at that
  point it's a separate entity in denial.

## Consequences

- New table `casso_flow_authorizations`; `bank_connections.cassoFlowAuthorizationId` is a
  nullable FK — rows connected before this change have none, and cannot be key-rotated
  (only disconnected) until reconnected through the current flow, which always creates or
  reuses an authorization.
- `encryptedCassoApiKey` and `encryptedSecureToken` move from `BankConnection` to
  `CassoFlowAuthorization`. `ReceiveWebhookUseCase`'s inbound-webhook secret check now
  resolves `BankConnection → CassoFlowAuthorization → encryptedSecureToken`, not a column
  on the connection row directly.
- Disconnecting one `BankConnection` never touches its `CassoFlowAuthorization` or sibling
  rows; the authorization's key is only invalidated when its last remaining
  `BankConnection` is disconnected.
- `PlanLimitService.enforceBankConnectionLimit` is unaffected — it counts ACTIVE
  `BankConnection` rows regardless of which authorization they belong to.
