# OTP Email Verification — Design Spec

Date: 2026-08-20
Status: Approved for planning

## Problem

Email verification at signup uses a magic link (`GET/POST /verify-email?token=...`).
Two problems surfaced:

1. **Broken links.** The link was built as a bare path (`/verify-email?token=...`)
   with no host, so email clients render it as `http:///verify-email?...` — an
   invalid, unclickable URL. (Fixed separately in PR #273 — this spec assumes
   that fix is already in place, but supersedes the link approach entirely.)
2. **UX**: `VerifyEmailPage`'s no-token state shows a free-text, re-editable
   email input for "resend verification email" — confusing right after the
   user just typed their email into the signup form. The user should instead
   see a masked-email hint ("mã đã được gửi tới email leng***@gmail.com") and
   an OTP code entry field, not a form asking them to type their email again.

## Decision

Replace the magic-link verification with a 6-digit OTP code, entered inline.
No new infrastructure — reuse the existing `email_verification_tokens` table,
domain entity, and repository, only changing what gets generated and how it's
looked up.

## Scope

**In scope:** signup email verification only (`signup`,
`resend-verification-email`, `verify-email` use cases; `SignupPage`,
`VerifyEmailPage`, `LoginPage`).

**Out of scope:** `forgot-password` (reset-password link), `invite-member` /
`resend-invite-by-operator` (invite-accept link). Both keep their existing
link-based flow — different use case, not part of this change.

**Reference, not reused as-is:** the existing change-password OTP flow
(`change-password-request/confirm/resend.usecase.ts`) has the same "hash +
expiry + lookup" shape we're copying, but its OTP is never actually emailed —
it's only written to the server log (`this.logger.log({ otp })`). That's fine
for change-password (an authenticated user with no other channel need), but
signup verification has no session yet, so it MUST email the code for real.

## Backend changes

### `token-hasher.ts`
Add `generateOtp()` and `hashOtp()` alongside the existing `generateToken()` /
`hashToken()` (same file already pairs a generator with a matching hasher for
the token flow):
```ts
export function hashOtp(otp: string): string {
  return createHash('sha256').update(otp).digest('hex');
}

export function generateOtp(): { otp: string; hash: string } {
  const otp = String(randomInt(100000, 999999));
  return { otp, hash: hashOtp(otp) };
}
```
`verify-email.usecase.ts` uses `hashOtp()` directly on the caller-supplied
code; `signup`/`resend-verification-email` use `generateOtp()` to mint a new
one.

### `signup.usecase.ts` / `resend-verification-email.usecase.ts`
- Swap `generateToken()` → `generateOtp()`.
- TTL: 24h → **10 minutes** (`VERIFICATION_TOKEN_TTL_MS = 10 * 60 * 1000`).
- Call `emailSender.sendVerificationEmail(user.email, otp)` — second argument
  is now the raw 6-digit code, not a URL.

### `verify-email.usecase.ts`
Signature changes from `execute(rawToken: string)` to
`execute(email: string, otp: string): Promise<LoginResult>`.

```ts
async execute(email: string, otp: string): Promise<LoginResult> {
  const user = await this.userRepo.findByEmail(email.trim().toLowerCase());
  const otpHash = hashOtp(otp); // sha256, matches generateOtp()'s hash
  const token = user
    ? await this.tokenRepo.findByUserIdAndTokenHash(user.id, otpHash)
    : null;

  if (!user || !token || token.isExpired(new Date())) {
    // Same generic error whether the email doesn't exist, the code is wrong,
    // or it expired — do not let a caller distinguish "no such email" from
    // "wrong code" (enumeration).
    throw new AppError(
      ErrorCode.UNAUTHORIZED,
      'Mã xác thực không hợp lệ hoặc đã hết hạn.',
    );
  }

  await this.dataSource.transaction(async (manager) => {
    await this.userRepo.save(user.markEmailVerified(), manager);
    await this.tokenRepo.deleteById(token.id, manager);
  });

  return this.loginUseCase.executeForUser(user.id);
}
```

### `email-verification-token-repository.port.ts` (+ TypeORM impl)
Replace `findByTokenHash(hash)` with `findByUserIdAndTokenHash(userId, hash)`
— it's the only caller, so there's no reason to keep both. A 6-digit code
isn't globally unique the way the old random-hex token was, so the lookup
must be scoped to the user first.

### `auth-email-sender.port.ts` / `resend-auth-email-sender.adapter.ts`
`sendVerificationEmail(to: string, verifyUrl: string)` →
`sendVerificationEmail(to: string, otp: string)`. Email body changes from a
clickable link to a large, readable code:
```html
<p>Mã xác thực email của bạn là: <strong style="font-size:24px;letter-spacing:4px">${otp}</strong></p>
<p>Mã có hiệu lực trong 10 phút.</p>
```

### `verify-email.dto.ts` + `auth.controller.ts`
`{ token: string }` → `{ email: string; otp: string }`
(`@IsEmail()`, `@Matches(/^\d{6}$/)`).

### `login.usecase.ts`
In `execute()` (the normal `/login` path — `executeForUser()` already checks
this), after password validation succeeds, add:
```ts
if (!user.isEmailVerified()) {
  throw new AppError(ErrorCode.EMAIL_NOT_VERIFIED, 'Email chưa được xác thực.');
}
```
This is what makes the `/verify-email` fallback route reachable — without it,
an unverified user who closed the signup tab has no path back. New
`ErrorCode.EMAIL_NOT_VERIFIED`, mapped to **403** in
`status-by-error-code.ts` (same bucket as `ORGANIZATION_PENDING_REVIEW` /
`ORGANIZATION_REJECTED`).

### Rate limiting / brute force
No new attempt-counter mechanism — rely on the existing
`AuthCompositeRateLimitGuard` (5 req/min per IP+email), already applied to
pre-auth endpoints and consistent with `change-password-confirm`'s lack of a
separate counter.
```
// ponytail: 5 req/min via AuthCompositeRateLimitGuard is the only brute-force
// ceiling on a 6-digit code; add a per-OTP attempt counter if abuse shows up.
```

## Frontend changes

- **`SignupPage`**: on successful signup, no more `navigate()` to a separate
  route. Switch local state (`step: 'form' | 'otp'`), render the OTP step
  inline — mirrors `ChangePasswordForm`'s `request`/`confirm` step pattern.
- **`EmailOtpStep`** (new, `features/auth/components/email-otp-step.tsx`):
  masked-email hint + `OtpInput` (existing shared component, reused as-is) +
  "Gửi lại mã" resend action. Shared between `SignupPage` and
  `VerifyEmailPage` — both live in the `auth` feature, so it stays inside
  `features/auth/components/`, no promotion to global `components/shared/`.
- **`maskEmail()`** (new, `lib/`): pure string helper —
  `leng***@gmail.com`. No new backend field; the email is already known
  client-side.
- **`VerifyEmailPage`**: becomes the fallback entry point only (reached via
  `/verify-email?email=...`, e.g. from the `LoginPage` redirect below) — drop
  the free-text email input and the `token`-in-URL branch entirely, render
  `EmailOtpStep` with the email from the query param.
- **`LoginPage`**: extend the existing `ORGANIZATION_PENDING_REVIEW` /
  `ORGANIZATION_REJECTED` error-code handling to also catch
  `EMAIL_NOT_VERIFIED` → `navigate('/verify-email?email=...')`.
- New hooks in `features/auth/api/`: `useVerifyEmailOtp()`,
  `useResendVerificationOtp()`.

## Edge cases

- **Enumeration**: `verify-email` throws the same generic error for
  "no such user", "wrong code", and "expired code" — never distinguishes.
- **Resend for an already-verified user**: stays silent (no email, no error),
  consistent with `forgot-password`'s existing no-enumeration behavior.
- **Stale pre-migration link-tokens** (24h, hex hash) left in the table at
  deploy time: harmless — `resend` always `deleteByUserId`s before inserting
  a fresh OTP, and the new numeric-hash lookup will never match an old
  hex-hash row.
- **Signup retry with an already-registered, unverified email**: unchanged —
  still `CONFLICT`; the only recovery path is "resend code", not signing up
  again.

## Testing

TDD RED → GREEN per changed use case: `signup.usecase.spec.ts`,
`resend-verification-email.usecase.spec.ts`, `verify-email.usecase.spec.ts`
(rewritten for the new signature + enumeration-safe error), `login.usecase.spec.ts`
(new unverified-email case), `token-hasher.spec.ts` (new `generateOtp()`
case). No existing e2e spec covers the verify-email flow, so no e2e rewrite
is required — new unit coverage is sufficient, matching current coverage
depth.
