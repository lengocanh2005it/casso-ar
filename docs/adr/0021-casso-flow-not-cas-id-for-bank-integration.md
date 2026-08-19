# Bank transaction integration is Casso Flow (third-party aggregator), not Cas ID (Open Banking)

**Status:** proposed

`BankConnection`, the Cas Link popup, and the Balance Hook webhook receiver were built
against **Cas ID** (cas.so / bankhub.dev) — an Open Banking API where this product would
drive an OAuth-style grant/consent flow to obtain direct read access to a business's bank
account (PR #266, #268, #269). That work has since been found to target the wrong
provider: this product's actual banking data source is **Casso Flow**
(flow.casso.vn) — a different, unrelated Vietnamese company that happens to share the
"Casso" name with this product. Casso Flow does not offer (and does not need) an
in-product bank-linking popup: a business links its bank account directly on Casso Flow's
own site, using Casso Flow's own credentials. This product only needs to (a) read which
account a business already linked, via Casso Flow's OAuth2, and (b) receive Casso Flow's
transaction webhook.

The name collision ("Casso Ledger" vs. "Casso Flow") is coincidental, not a rebrand or a
partnership — `CONTEXT.md` now uses "Casso Flow" as the canonical term for the third-party
service everywhere the ambiguity could otherwise recur.

## Considered Options

- **Keep the Cas ID integration, add Casso Flow alongside it**: rejected. Both exist to
  solve the same need (real-time bank transaction data); the product has no reason to
  support two competing bank-integration providers at once, and doing so would keep dead,
  unreachable code (the entire Cas Link popup flow, `CasIdConnectionSession`,
  `CasIdAdapter`) indefinitely, misleading future readers about which integration is live.
- **Keep Cas ID's OAuth-popup *shape* but point it at Casso Flow's OAuth2 endpoints**:
  rejected as the wrong mental model even though Casso Flow does have its own OAuth2 flow.
  Cas ID's popup existed to obtain *bank-linking consent* (the product asking to touch the
  user's bank account directly) — Casso Flow's OAuth2 exists only to let the product *read
  an already-linked account's info and register a webhook*, a narrower and different
  authorization. Reusing the old flow's shape without renaming the concepts it encodes
  (`grantId`, `CasIdConnectionSession`, "reactivate") would leave the domain model
  describing bank-linking consent for a flow that no longer grants that.
- **Drop the OAuth2 popup entirely, require manual `secure_token`/`accountNumber` entry**
  (Option A from the brainstorming session): considered as the leaner MVP, but rejected in
  favor of the OAuth2-automated option (Option B) per explicit user preference — the manual
  option remains available as a documented fallback if Casso Flow's OAuth2 integration
  proves unreliable during implementation.

## Consequences

- Everything shipped in PR #266/#268/#269 for Cas ID is removed: `CasIdConnectionSession`
  (domain + ORM + repository), `CasIdAdapter`/`MockCasIdAdapter`/`select-cas-id-adapter`,
  the Cas Link popup frontend (`cas-link.ts`, `cas-id-callback-page.tsx`,
  `CasIdConnectionFlow`), the `bank_connections.grantId` column and its migration, and the
  `ICasIdIntegrationAdapter` port. This is intentional dead-code removal, not a partial
  rollback — no fallback to Cas ID is planned.
- `BankConnection`'s meaning changes: it no longer represents "this product's own
  Open-Banking grant on a bank account" — it represents "this product's authorization to
  read a Casso-Flow-linked account's info and receive its webhook." Fields change
  accordingly (`accountNumber` becomes the primary correlation key; `grantId` is replaced
  by a Casso-Flow-issued OAuth access/refresh token pair; `encryptedAccessToken` is
  replaced by `encryptedSecureToken`, the webhook-verification secret this product
  generates and registers with Casso Flow, not something Casso Flow hands back).
- Inbound webhook resolution changes from "look up by `grantId` carried in the payload" to
  "look up by `accountNumber` carried in the payload, then verify using that
  organization's stored `secure_token`" — a two-step resolve-then-verify, not a
  single-step keyed lookup.
- The exact Casso Flow webhook header/signature scheme (`secure-token` vs.
  `X-Casso-Signature`) returned by `POST /v2/webhooks` is not fully documented publicly and
  must be confirmed empirically against a real registration during implementation, not
  assumed from docs — same caution this product already learned the hard way once this
  session by trusting incomplete Cas ID docs.
