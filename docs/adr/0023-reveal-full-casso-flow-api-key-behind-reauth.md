# Reveal full Casso Flow API Key behind password re-auth, not masked-only

`CassoFlowAuthorization.encryptedApiKey` was originally written to be decrypted only by
the backend itself (to call Casso Flow's API) and was never meant to round-trip back to
a client. Businesses asked to see the key they entered again, for reconciliation against
Casso Flow's own dashboard — a masked preview (`AK_CS.a1b2****`) doesn't satisfy that,
only the full value does.

We decided to expose the full plaintext key on demand rather than staying masked-only,
gated by three layers: a new `BANK_CONNECTION_REVEAL_KEY` permission (separate from
`BANK_CONNECTION_MANAGE`, granted to `OWNER`/`FINANCE_MANAGER`), a re-entered password
checked against the requesting user's own password hash on every reveal (no session-level
"already revealed, skip the check"), and a `ConnectionAuditEvent` row per reveal so every
disclosure is traceable to a user and a timestamp.

The alternative — masked-only, never plaintext — was rejected as not meeting the actual
business need (reconciliation requires the real value, not a prefix). The re-auth
requirement exists because the encryption key already makes decryption possible; without
re-auth, a stolen access token alone would be enough to exfiltrate a live third-party
credential, which downgrades this from "backend-only secret" to "readable by anyone with
a live session."
