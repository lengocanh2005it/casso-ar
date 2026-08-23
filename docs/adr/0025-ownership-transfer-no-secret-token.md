---
status: proposed
---

# Ownership-transfer acceptance uses JWT auth, not a secret token

Every other pending-action-by-email flow in this codebase (`MembershipInvite`,
password reset) hands the recipient a single-use secret token in a URL,
because the recipient isn't authenticated yet — the token *is* the
credential. `OwnershipTransferRequest`'s target is different: they're already
an existing, authenticated `Membership` in the organization, not a stranger
being onboarded.

We deliberately do **not** generate a secret accept/decline token for the
target side of an ownership transfer. Once the target is required to be
logged in as that exact `userId` to act on the request, a token in the URL
adds no further authorization — it would just be a second credential
alongside the JWT for no additional guarantee, plus a `tokenHash`/expiry
column and a token-hashing code path (`token-hasher.ts`) to maintain. The
notification email is a plain "you have a pending ownership transfer, check
Settings" message with no link secret; the target reaches the pending
request via `GET .../ownership-transfers/pending-for-me`, authorized purely
by `req.user.userId` matching the request's target.

## Considered Options

Reuse `MembershipInvite`'s exact token mechanism (`generateToken()`/
`hashToken()`, token in the notification link) for consistency with the
codebase's one other pending-action-by-email flow. Rejected: that pattern
exists specifically to authenticate a *pre-auth* recipient; grafting it onto
an already-authenticated target buys no security and only adds surface area
(a leaked/forwarded email would carry a working link, whereas here it
carries nothing exploitable on its own).

## Consequences

`OwnershipTransferRequest` needs no `tokenHash`/token-`expiresAt` columns for
the acceptance step (only the OTP fields, for the OWNER-side confirmation).
The accept/decline endpoints are ordinary `JwtAuthGuard`-protected routes
authorized by object ownership (`targetUserId === req.user.userId`), the
same shape as `ChangePasswordConfirmUseCase` acting on the caller's own
resource — no new token-generation code path.
