# Authentication & Onboarding Design

> Child spec of [docs/overview.md](../../../docs/overview.md). Adds the foundation assumed by [2026-08-03-multi-tenancy-rbac-design.md](2026-08-03-multi-tenancy-rbac-design.md) ("AuthGuard validates JWT") but not defined there: signup, login, member invitations, and password reset.

## 1. Additional entities (extending the Multi-tenancy/RBAC spec)

```
User
  id, name, email, passwordHash, emailVerifiedAt (nullable), createdAt

EmailVerificationToken
  id, userId, token (hash stored in DB), expiresAt, createdAt

PasswordResetToken
  id, userId, token (hash stored in DB), expiresAt, usedAt (nullable), createdAt

MembershipInvite
  id, organizationId, email, role, invitedByUserId, token (hash stored in DB),
  expiresAt, acceptedAt (nullable), createdAt

RefreshToken
  id, userId, tokenHash, expiresAt, revokedAt (nullable), createdAt
```

`MembershipInvite` is separate from `Membership` (defined in the multi-tenancy-rbac spec). `Membership` is created only when an invite is accepted, avoiding an unclaimed "ghost" membership. All tokens (verification/reset/invite/refresh) are stored as hashes, not plaintext; if the database is exposed, the tokens cannot be used directly.

## 2. Signup flow

```
POST /auth/signup { organizationName, name, email, password }
  1 transaction:
    - Create Organization
    - Create User (emailVerifiedAt=null)
    - Create Membership (role=OWNER, joinedAt=now)
    - Create Subscription (status=ACTIVE, planId=FREE) in the same transaction
    - Run `OrganizationBootstrap` in the same transaction to seed the organization's default `EmailTemplate`, `ReminderPolicy`, and `ReminderRule`; every repository receives the same `EntityManager`
  → send EmailVerificationToken through EmailService (2026-08-03-email-notification-service-design.md)
  → return `accessToken` + `userId` + `organizationId`; keep the refresh token in an httpOnly cookie
    (allowing login), while all other APIs
    (except /auth/* and /me) are blocked by EmailVerifiedGuard until verification

GET /auth/verify-email?token=...
  → find the unexpired EmailVerificationToken, set User.emailVerifiedAt=now, delete the token
```

Email verification is required before use. This matters for a fintech product that sends real payment reminders to customers and prevents accounts created with disposable or fake email addresses.

## 3. Login & token refresh

```
POST /auth/login { email, password }
  → compare with passwordHash (bcrypt/argon2)
  → return an access token JWT (15 minutes, payload contains { userId, organizationId, role })
    + set a refresh token (7 days, httpOnly cookie, hash stored in RefreshToken so it can be revoked)

POST /auth/refresh (read the refresh token from the cookie)
  → validate that it is unexpired and not revoked → issue a new access token and rotate the refresh token
    (revoke the old refresh token and issue a new one)—prevents replay if the refresh token is stolen

POST /auth/logout → revoke the current refresh token
```

The JWT payload includes `role` so `PermissionGuard` does not query `Membership` on every request. Tradeoff: if a user's role changes (for example, downgraded from FINANCE_MANAGER to VIEWER), the old permission remains valid until the access token expires (up to 15 minutes). The MVP accepts this delay instead of querying the database per request; the role change takes effect on the next `/auth/refresh` because the new access token reads the current `role` from `Membership`.

For a user belonging to multiple Organizations, the access token defaults to the first/most recently used organization. `POST /auth/switch-organization` issues a new access token with a different `organizationId`/`role`, only for an organization where the user has an active `Membership` (`joinedAt != null`). The JWT must not be treated as proof of membership; `JwtStrategy` must revalidate `(userId, organizationId)` through `Membership` and read the current role.

## 4. Invite member

```
POST /organizations/:id/invites { email, role }
  Permission: USER_MANAGE (OWNER, FINANCE_MANAGER—per the RBAC spec)
  → create MembershipInvite and send an email containing a link + token (expires in 7 days)

POST /invites/accept { token, password (only required if the email has no User) }
  - Email already has a User (possibly in another organization) → that User's own JWT is required;
    acceptance only creates a new Membership and never duplicates the User
  - Email has no User → create a User (password entered in the acceptance form), always set emailVerifiedAt=now
    (accepting an invite through email verifies ownership of the email)
  → set Membership.joinedAt=now, MembershipInvite.acceptedAt=now
```

## 5. Forgot / reset password

```
POST /auth/forgot-password { email } → always return 200 whether the email exists or not
  (avoid revealing which emails are registered); if it exists, create PasswordResetToken + send email

POST /auth/reset-password { token, newPassword }
  → validate that the token is unexpired (30–60 minutes) and unused (usedAt=null)
  → set a new passwordHash, usedAt=now, and REVOKE all existing RefreshToken records for the user
    (log out every device; password changes commonly indicate suspected exposure)
```

`POST /auth/forgot-password` returns HTTP 200 and the same success body whether the email exists or not; it does not return 201/404 or disclose account status.

## 6. Rate limiting `/auth/*`

Use NestJS `ThrottlerModule` (already a common dependency; do not add a new library):

```
/auth/login, /auth/forgot-password, /auth/signup:
  limit 5 requests / minute, by the pair (IP, normalized email in the body)
  → over the limit returns 429 without disclosing additional information (generic message "Too many requests, try again later")

Implementation note: do not use the default `@Throttle` if its tracker uses IP only; use a custom tracker/key containing IP + email for these three endpoints.
```

Apply this only to `/auth/*` because it is the clearest brute-force/credential-stuffing attack surface. This spec does not apply a global API rate limit (if needed, that belongs to shared middleware/API-gateway scope in a later spec).

## 7. Out of scope

- SSO/social OAuth login (Google/Microsoft)—excluded from the multi-tenancy-rbac scope (Enterprise later).
- 2FA/MFA—not in the original document; add later if stricter compliance is required.
- Rate limiting for the entire API (outside `/auth/*`)—shared middleware scope; no separate spec yet.

## 8. Open questions (do not block implementation)

- Should `RefreshToken` limit concurrent logged-in devices (for example, at most 5 active refresh tokens per user), or be unlimited in the MVP?
- After an invite expires (7 days), should an API let the OWNER resend it (new token on the same `MembershipInvite` or a new record)?
