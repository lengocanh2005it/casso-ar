# Refresh-token reuse gets a 10-second rotation grace window

**Status:** accepted

Every page load calls `POST /auth/refresh` (the access token lives only in
memory), so a reload that cancels the request after the server rotated the
token but before the browser stored the new cookie makes the next load
present a just-revoked token. Theft detection treated that as a leaked copy
and revoked the whole family, signing the user out of every device.

We now treat re-presentation of a rotated `RefreshToken` within 10 seconds of
its rotation as a benign race: the family is kept and the presenter receives
a fresh `RefreshToken` in the same session. The window is measured from the
successor's `createdAt` (a `timestamptz`), because `revokedAt` is a
timezone-less `timestamp` that would skew the window across processes with
different `TZ`. It applies only when all hold: the token has a successor link
(`replacedByTokenId`), the successor is not revoked, the token itself had not
expired, and the successor is at most 10 seconds old. Tokens revoked by
logout, password change/reset or member removal never qualify, and reuse
outside the window still revokes the family. The rule is evaluated before the
rotation transaction and again under the row lock (the successor is read under
a share lock so a concurrent logout cannot slip in); if the window closes in
between, the family is revoked after the transaction rather than the request
failing quietly.

Each grace issuance is logged at `warn` with `userId` and `requestId`. The
pre-auth refresh route has no tenant user, so `JsonLogger` now keeps a
`userId` passed in the log fields when no user is authenticated (the
authenticated user still wins).

**Sessions.** Each login starts a session (`sessionId`); rotation and grace
issuance inherit it. Logout revokes every token of the session, not only the
presented one, because the grace path deliberately leaves the original
successor alive (a short-lived fork) and that sibling would otherwise let a
replayed token mint a session after logout. Other logins of the same user are
untouched. A token issued before sessions existed starts a session the first
time it is rotated (a grace replay of it joins its successor's session); until
then, logout revokes only the presented token, as before.

The 10 s value is a constant, not configuration. The orphaned sibling from a
grace fork expires with its normal 7-day TTL rather than being revoked early,
because revoking it would break whichever cookie the browser ends up keeping.

## Considered Options

- **Frontend-only** (`navigator.locks` + not clearing the session hint):
  fixes multi-tab but cannot fix a cancelled reload. Kept as a complement,
  not a substitute.
- **Reject quietly inside the window without issuing a token:** prevents the
  all-device sign-out but still sends the reloading user to the login page,
  because the rotated cookie never reached the browser.
- **`revokedReason` enum instead of a successor link:** does not, by itself,
  stop a token rotated and then logged out from minting a session inside the
  window; the successor-still-valid check does.
- **Revoke the sibling successor when a grace token is issued (linear
  chain):** rejected — if the responses reach the browser out of order the
  cookie ends up being the revoked sibling and the next load signs the user
  out. Session-scoped logout closes the same hole without that risk.

## Consequences

An attacker holding a leaked token can replay it during the first 10 seconds
after rotation and receive a valid session without the family being revoked.
Every replay in that window mints another 7-day token (the presented token and
its successor are left unchanged), so one leaked token can yield several live
tokens. They all belong to the victim's session and die together on logout,
and password change/reset revokes them all. For issue #410, the accepted
refresh-endpoint policy is to retain only the existing `default` limit of 100
requests per minute per IP, while bypassing the stricter `ip` limit of 20
requests per 15 minutes and the shared auth abuse-escalation lockout. This
allows repeated page loads without letting refresh failures lock users out of
login; requests count regardless of whether the refresh cookie is valid. A
per-cookie limit was rejected because successful refreshes rotate the cookie,
so each request would move to a new key. Implementation is pending.

If a token was rotated twice inside the window (T1 -> T2 -> T5) and a late
request still carries T1, its successor T2 is revoked, so it is treated as
theft and the family is revoked. A grace fork makes this slightly more
reachable (a normal rotation of the fork's sibling also revokes T2). Following
the successor chain would close it, but it only ever fails safe (the user logs
in again), so we accept it rather than add chain-walking.

No backfill: tokens revoked before the migration have no successor and never
get the window.
