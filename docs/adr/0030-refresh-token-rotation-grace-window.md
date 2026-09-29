---
status: proposed
---

# Refresh-token reuse gets a 10-second rotation grace window

Every page load calls `POST /auth/refresh` (the access token lives only in
memory), so a reload that cancels the request after the server rotated the
token but before the browser stored the new cookie makes the next load
present a just-revoked token. Theft detection treated that as a leaked copy
and revoked the whole family, signing the user out of every device.

We now treat re-presentation of a rotated `RefreshToken` within 10 seconds of
its rotation (measured from its successor's `createdAt`, a `timestamptz`,
because `revokedAt` is a timezone-less `timestamp` that would skew the window
across processes with different `TZ`) as a benign race: the family is kept and the presenter receives
a fresh `RefreshToken`. The window applies only when the token has a
successor link (`replacedByTokenId`) and that successor is still valid, so
tokens revoked by logout, password change/reset or member removal — which
have no successor, or a revoked one — never qualify. Reuse outside the window
still revokes the family. Each grace issuance is logged at `warn` level.

The 10 s value is a constant, not configuration. A token issued through the
grace path leaves its sibling successor alive (a short-lived fork); the
orphan expires with its normal 7-day TTL rather than being revoked, because
revoking it would break whichever cookie the browser ends up keeping.

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

## Consequences

If a token was rotated twice inside the window (T1 -> T2 -> T5) and a late
request still carries T1, its successor T2 is revoked, so it is treated as
theft and the family is revoked. Following the successor chain would close
this, but needs two rotations plus a late request and only ever fails safe
(the user logs in again), so we accept it rather than add chain-walking.

An attacker holding a leaked token can replay it during the first 10 seconds
after rotation and receive a valid session without the family being revoked.
Accepted as the trade-off the issue calls out. No backfill: tokens revoked
before the migration have no successor and never get the window.
