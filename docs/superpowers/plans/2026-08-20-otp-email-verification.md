# OTP Email Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the magic-link signup email verification flow with a 6-digit OTP entered inline, fixing the broken/unclickable link and the confusing free-text email input on the resend screen.

**Architecture:** Reuse the existing `email_verification_tokens` table, domain entity, and repository — only the generated value (6-digit code instead of opaque hex token), its TTL (10 min instead of 24h), and the lookup (scoped by userId instead of globally unique) change. `LoginUseCase.execute()` gains an email-verified gate so a returning unverified user has a path back to the OTP screen. `SignupUseCase` drops its now-contradictory auto-login-before-verification branch (already unused by the frontend).

**Tech Stack:** NestJS 11 (backend), React 19 + Vite + TanStack Query (frontend), TypeORM 1.1 / PostgreSQL 16, Jest 30 (backend unit tests), Vitest + Testing Library (frontend tests).

**Spec:** `docs/superpowers/specs/2026-08-20-otp-email-verification-design.md`

## Global Constraints

- OTP: 6 digits, `randomInt(100000, 999999)`, hashed with SHA-256 (same algorithm family as the existing `hashToken`).
- OTP TTL: 10 minutes.
- `verify-email` (email + otp) throws the **same generic error** (`UNAUTHORIZED`, "Mã xác thực không hợp lệ hoặc đã hết hạn.") whether the email doesn't exist, the code is wrong, or it expired — never a distinguishing message.
- No new attempt-counter mechanism — brute-force protection is the existing `AuthCompositeRateLimitGuard` (5 req/min per IP+email), applied to every pre-auth endpoint touched here.
- Scope is signup email verification only: `signup`, `resend-verification-email`, `verify-email`, and the `login` gate that gives a returning unverified user a way back. `forgot-password` and `invite-member`/`resend-invite-by-operator` links are untouched.
- `SignupUseCase` never returns `accessToken`/`refreshToken` again — the auto-login-for-ACTIVE-org branch is removed (the frontend already discards these fields today).
- Do not log the raw OTP anywhere (matches the change-password fix already merged on this branch).

---

### Task 1: `generateOtp()` / `hashOtp()` in the shared token hasher

**Files:**
- Modify: `apps/backend/src/modules/auth/application/token-hasher.ts`
- Modify: `apps/backend/src/modules/auth/application/token-hasher.spec.ts`

**Interfaces:**
- Produces: `generateOtp(): { otp: string; hash: string }`, `hashOtp(otp: string): string` — both exported from `token-hasher.ts`, consumed by Tasks 6-8.

- [ ] **Step 1: Write the failing tests**

Add to `token-hasher.spec.ts` (keep the existing `describe('token-hasher', ...)` block, add a new one below it):

```ts
import { generateOtp, generateToken, hashOtp, hashToken } from './token-hasher';

describe('otp-hasher', () => {
  it('generates a 6-digit OTP and its matching hash consistently', () => {
    const { otp, hash } = generateOtp();

    expect(otp).toMatch(/^\d{6}$/);
    expect(hashOtp(otp)).toBe(hash);
  });

  it('produces different OTPs on each call', () => {
    const first = generateOtp();
    const second = generateOtp();

    expect(first.otp).not.toBe(second.otp);
  });
});
```

(Update the top import line to add `generateOtp, hashOtp` alongside the existing `generateToken, hashToken` import.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/backend && npx jest --testPathPatterns token-hasher.spec -v`
Expected: FAIL — `generateOtp is not a function` / `hashOtp is not a function`.

- [ ] **Step 3: Implement**

Replace the full contents of `token-hasher.ts` with:

```ts
import { createHash, randomBytes, randomInt } from 'node:crypto';

export function generateToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('hex');
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function hashOtp(otp: string): string {
  return createHash('sha256').update(otp).digest('hex');
}

export function generateOtp(): { otp: string; hash: string } {
  const otp = String(randomInt(100000, 999999));
  return { otp, hash: hashOtp(otp) };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/backend && npx jest --testPathPatterns token-hasher.spec -v`
Expected: PASS, 4 tests total.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/auth/application/token-hasher.ts apps/backend/src/modules/auth/application/token-hasher.spec.ts
git commit -m "feat: add generateOtp/hashOtp to token-hasher"
```

---

### Task 2: Migration — drop the unique index on `email_verification_tokens.tokenHash`

**Why:** the column currently has `@Index({ unique: true })`. A 6-digit OTP is drawn from a space of only 1,000,000 values, so two different users can legitimately get the same code around the same time — a global unique constraint would make the second `INSERT` crash with a DB error. Uniqueness now needs to be scoped per-user (enforced by application logic in Task 3/9, not a DB constraint), so the index must go. The dev DB's actual index name (queried via `\d email_verification_tokens`) is `IDX_90489f8f3368c45f461e90efbe` — TypeORM's deterministic hash-based name for this table+column, so it's the same in every environment that has this column.

**Files:**
- Create: `apps/backend/src/database/migrations/20260829000000-drop-email-verification-token-hash-unique-index.ts`
- Create: `apps/backend/src/database/migrations/20260829000000-drop-email-verification-token-hash-unique-index.spec.ts`
- Modify: `apps/backend/src/modules/auth/infrastructure/email-verification-token.orm-entity.ts`

**Interfaces:** none consumed/produced — this is a standalone schema change. `synchronize: true` in dev picks up the entity change automatically on next backend restart; the migration file is what applies it in an environment that runs migrations (production).

- [ ] **Step 1: Write the failing test**

```ts
import type { QueryRunner } from 'typeorm';
import { DropEmailVerificationTokenHashUniqueIndex20260829000000 } from './20260829000000-drop-email-verification-token-hash-unique-index';

describe('DropEmailVerificationTokenHashUniqueIndex20260829000000', () => {
  it('drops the unique index on up', async () => {
    const migration = new DropEmailVerificationTokenHashUniqueIndex20260829000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.up(queryRunner);

    expect(query).toHaveBeenCalledWith(
      'DROP INDEX IF EXISTS "IDX_90489f8f3368c45f461e90efbe"',
    );
  });

  it('recreates the unique index on down', async () => {
    const migration = new DropEmailVerificationTokenHashUniqueIndex20260829000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.down(queryRunner);

    expect(query).toHaveBeenCalledWith(
      'CREATE UNIQUE INDEX "IDX_90489f8f3368c45f461e90efbe" ON "email_verification_tokens" ("tokenHash")',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest --testPathPatterns 20260829000000 -v`
Expected: FAIL — module not found (`Cannot find module './20260829000000-drop-email-verification-token-hash-unique-index'`).

- [ ] **Step 3: Implement the migration**

```ts
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class DropEmailVerificationTokenHashUniqueIndex20260829000000
  implements MigrationInterface
{
  name = 'DropEmailVerificationTokenHashUniqueIndex20260829000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_90489f8f3368c45f461e90efbe"',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE UNIQUE INDEX "IDX_90489f8f3368c45f461e90efbe" ON "email_verification_tokens" ("tokenHash")',
    );
  }
}
```

Then update `email-verification-token.orm-entity.ts` to drop the `@Index` decorator so `synchronize: true` (dev) matches the migration (production):

```ts
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'email_verification_tokens' })
export class EmailVerificationTokenOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  userId: string;

  @Column({ type: 'varchar' })
  tokenHash: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npx jest --testPathPatterns 20260829000000 -v`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/database/migrations/20260829000000-drop-email-verification-token-hash-unique-index.ts apps/backend/src/database/migrations/20260829000000-drop-email-verification-token-hash-unique-index.spec.ts apps/backend/src/modules/auth/infrastructure/email-verification-token.orm-entity.ts
git commit -m "fix: drop unique index on email_verification_tokens.tokenHash for OTP reuse across users"
```

---

### Task 3: Repository — scope the token lookup by userId

**Files:**
- Modify: `apps/backend/src/modules/auth/application/email-verification-token-repository.port.ts`
- Modify: `apps/backend/src/modules/auth/infrastructure/typeorm-email-verification-token.repository.ts`

**Interfaces:**
- Consumes: `EmailVerificationToken` domain entity (unchanged), `EmailVerificationTokenOrmEntity` (Task 2).
- Produces: `IEmailVerificationTokenRepository.findByUserIdAndTokenHash(userId: string, tokenHash: string, manager?: EntityManager): Promise<EmailVerificationToken | null>` — replaces `findByTokenHash`, consumed by Task 9 (`VerifyEmailUseCase`).

There is no dedicated unit test file for this repository (it's exercised indirectly through `VerifyEmailUseCase`'s mocked port in Task 9, and through e2e coverage elsewhere in the auth module) — this task is a pure interface/implementation rename with no independent test cycle, matching the "configuration-only" TDD exception in AGENTS.md. Verify it compiles and every other caller of the old method name is gone.

- [ ] **Step 1: Rename the port method**

Replace the full contents of `email-verification-token-repository.port.ts`:

```ts
import type { EntityManager } from 'typeorm';
import type { EmailVerificationToken } from '../domain/email-verification-token';

export interface IEmailVerificationTokenRepository {
  findByUserIdAndTokenHash(
    userId: string,
    tokenHash: string,
    manager?: EntityManager,
  ): Promise<EmailVerificationToken | null>;
  save(token: EmailVerificationToken, manager?: EntityManager): Promise<void>;
  deleteByUserId(userId: string, manager?: EntityManager): Promise<void>;
  deleteById(id: string, manager?: EntityManager): Promise<void>;
}

export const EMAIL_VERIFICATION_TOKEN_REPOSITORY = Symbol(
  'EMAIL_VERIFICATION_TOKEN_REPOSITORY',
);
```

- [ ] **Step 2: Update the TypeORM implementation**

In `typeorm-email-verification-token.repository.ts`, replace the `findByTokenHash` method:

```ts
  async findByUserIdAndTokenHash(
    userId: string,
    tokenHash: string,
    manager?: EntityManager,
  ): Promise<EmailVerificationToken | null> {
    const row = await (manager
      ? manager.getRepository(EmailVerificationTokenOrmEntity)
      : this.repo
    ).findOne({ where: { userId, tokenHash } });
    return row ? new EmailVerificationToken(row) : null;
  }
```

(Leave `save`, `deleteByUserId`, `deleteById` unchanged.)

- [ ] **Step 3: Type-check**

Run: `cd apps/backend && npx tsc --noEmit`
Expected: errors in `verify-email.usecase.ts` (still calling the old method name — expected, fixed in Task 9) and nowhere else in this module's infra/application files. No errors in any *other* module (confirms `findByTokenHash` on password-reset-token / refresh-token / membership-invite repositories — separate interfaces — are untouched).

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/modules/auth/application/email-verification-token-repository.port.ts apps/backend/src/modules/auth/infrastructure/typeorm-email-verification-token.repository.ts
git commit -m "refactor: scope email-verification-token lookup by userId, not a global unique hash"
```

---

### Task 4: Email sender — OTP instead of a link

**Files:**
- Modify: `apps/backend/src/modules/auth/application/auth-email-sender.port.ts`
- Modify: `apps/backend/src/modules/auth/infrastructure/resend-auth-email-sender.adapter.ts`
- Modify: `apps/backend/src/modules/auth/infrastructure/resend-auth-email-sender.adapter.spec.ts`

**Interfaces:**
- Produces: `IAuthEmailSender.sendVerificationEmail(to: string, otp: string): Promise<void>` — same method name, second parameter is now a 6-digit code, not a URL. Consumed by Task 7 (`SignupUseCase`) and Task 8 (`ResendVerificationEmailUseCase`).

- [ ] **Step 1: Update the failing tests**

In `resend-auth-email-sender.adapter.spec.ts`, replace the `'queues verification email'` test body (lines 6-20) and the two `sendVerificationEmail` calls inside `'wraps queue errors as AppError with EMAIL_SEND_FAILED'` (lines 58-69):

```ts
  it('queues verification email', async () => {
    const emailQueue = { add: jest.fn().mockResolvedValue(undefined) };
    await new ResendAuthEmailSenderAdapter(
      emailQueue as any,
    ).sendVerificationEmail('user@example.com', '482913');
    expect(emailQueue.add).toHaveBeenCalledWith('send-auth-email', {
      to: 'user@example.com',
      subject: expect.any(String),
      html: expect.stringContaining('482913'),
      emailType: 'AUTH_VERIFICATION',
    });
  });
```

```ts
  it('wraps queue errors as AppError with EMAIL_SEND_FAILED', async () => {
    const emailQueue = {
      add: jest.fn().mockRejectedValue(new Error('Queue full')),
    };
    const adapter = new ResendAuthEmailSenderAdapter(emailQueue as any);

    await expect(
      adapter.sendVerificationEmail('user@example.com', '482913'),
    ).rejects.toThrow(AppError);

    try {
      await adapter.sendVerificationEmail('user@example.com', '482913');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).errorCode).toBe(ErrorCode.EMAIL_SEND_FAILED);
      expect((error as AppError).cause).toBeInstanceOf(Error);
      expect(((error as AppError).cause as Error).message).toBe('Queue full');
    }
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/backend && npx jest --testPathPatterns resend-auth-email-sender.adapter.spec -v`
Expected: FAIL — `expect(emailQueue.add).toHaveBeenCalledWith(...)` mismatch, `html` still contains the old link markup.

- [ ] **Step 3: Update the port and adapter**

In `auth-email-sender.port.ts`, change the first line:

```ts
export interface IAuthEmailSender {
  sendVerificationEmail(to: string, otp: string): Promise<void>;
  sendPasswordResetEmail(to: string, resetUrl: string): Promise<void>;
  sendChangePasswordOtpEmail(to: string, otp: string): Promise<void>;
```

In `resend-auth-email-sender.adapter.ts`, replace the `sendVerificationEmail` method body:

```ts
  async sendVerificationEmail(to: string, otp: string): Promise<void> {
    try {
      await this.emailQueue.add('send-auth-email', {
        to,
        subject: 'Mã xác thực email của bạn',
        html: `<p>Mã xác thực email của bạn là: <strong style="font-size:24px;letter-spacing:4px">${otp}</strong></p><p>Mã có hiệu lực trong 10 phút.</p>`,
        emailType: 'AUTH_VERIFICATION',
      });
    } catch (error) {
      this.logger.error('Failed to enqueue verification email', {
        to,
        error: error instanceof Error ? error.message : String(error),
      });
      throw AppError.withCause(
        error,
        ErrorCode.EMAIL_SEND_FAILED,
        'Không thể gửi email xác thực. Vui lòng thử lại sau.',
      );
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/backend && npx jest --testPathPatterns resend-auth-email-sender.adapter.spec -v`
Expected: PASS, all 8 tests (the change-password OTP test from the earlier fix stays untouched).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/auth/application/auth-email-sender.port.ts apps/backend/src/modules/auth/infrastructure/resend-auth-email-sender.adapter.ts apps/backend/src/modules/auth/infrastructure/resend-auth-email-sender.adapter.spec.ts
git commit -m "feat: send the OTP code in the verification email instead of a link"
```

---

### Task 5: `EMAIL_NOT_VERIFIED` error code

**Files:**
- Modify: `apps/backend/src/common/errors/error-code.ts`
- Modify: `apps/backend/src/common/errors/status-by-error-code.ts`

**Interfaces:**
- Produces: `ErrorCode.EMAIL_NOT_VERIFIED` mapped to HTTP 403. Consumed by Task 6 (`LoginUseCase`).

- [ ] **Step 1: Add the error code**

In `error-code.ts`, add a new member next to `ORGANIZATION_PENDING_REVIEW`/`ORGANIZATION_REJECTED`:

```ts
  ORGANIZATION_PENDING_REVIEW = 'ORGANIZATION_PENDING_REVIEW',
  ORGANIZATION_REJECTED = 'ORGANIZATION_REJECTED',
  EMAIL_NOT_VERIFIED = 'EMAIL_NOT_VERIFIED',
```

- [ ] **Step 2: Map it to a status code**

In `status-by-error-code.ts`, add next to the other two:

```ts
  [ErrorCode.ORGANIZATION_PENDING_REVIEW]: 403,
  [ErrorCode.ORGANIZATION_REJECTED]: 403,
  [ErrorCode.EMAIL_NOT_VERIFIED]: 403,
```

- [ ] **Step 3: Type-check**

Run: `cd apps/backend && npx tsc --noEmit`
Expected: PASS (no code references the new value yet — safe, additive change).

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/common/errors/error-code.ts apps/backend/src/common/errors/status-by-error-code.ts
git commit -m "feat: add EMAIL_NOT_VERIFIED error code"
```

---

### Task 6: `LoginUseCase` — block login for an unverified email

**Files:**
- Modify: `apps/backend/src/modules/auth/application/login.usecase.ts`
- Modify: `apps/backend/src/modules/auth/application/login.usecase.spec.ts`

**Interfaces:**
- Consumes: `ErrorCode.EMAIL_NOT_VERIFIED` (Task 5), `User.isEmailVerified()` (already exists, unchanged).
- Produces: `LoginUseCase.execute()` now throws `AppError(ErrorCode.EMAIL_NOT_VERIFIED, ...)` for an unverified user — this is what the frontend's `LoginPage` (Task 15) redirects on.

- [ ] **Step 1: Write the failing test**

Add to `login.usecase.spec.ts`, inside the `describe('LoginUseCase', ...)` block (after the `'throws on wrong password'` test):

```ts
  it('throws EMAIL_NOT_VERIFIED for a correct password but an unverified email', async () => {
    const passwordHash = await hashPassword('S3curePass!');
    const user = new User({
      id: 'user-1',
      name: 'An',
      email: 'ap@congtyb.vn',
      passwordHash,
      emailVerifiedAt: null,
      createdAt: new Date(),
    });
    const organizationRepo = buildOrganizationRepo('ACTIVE');
    const useCase = new LoginUseCase(
      { findByEmail: jest.fn().mockResolvedValue(user) } as any,
      {} as any,
      {} as any,
      {} as any,
      organizationRepo as any,
    );

    await expect(
      useCase.execute({ email: 'ap@congtyb.vn', password: 'S3curePass!' }),
    ).rejects.toMatchObject({
      errorCode: 'EMAIL_NOT_VERIFIED',
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest --testPathPatterns login.usecase.spec -v`
Expected: FAIL — the call resolves instead of rejecting (current `execute()` never checks `isEmailVerified()`).

- [ ] **Step 3: Add the check**

In `login.usecase.ts`, in `execute()`, right after the password check and before the membership lookup:

```ts
  async execute(input: LoginInput): Promise<LoginResult> {
    const email = input.email.trim().toLowerCase();
    const user = await this.userRepo.findByEmail(email);
    if (!user || !(await comparePassword(input.password, user.passwordHash))) {
      throw new AppError(
        ErrorCode.UNAUTHORIZED,
        'Email hoặc mật khẩu không đúng.',
      );
    }
    if (!user.isEmailVerified()) {
      throw new AppError(
        ErrorCode.EMAIL_NOT_VERIFIED,
        'Email chưa được xác thực.',
      );
    }

    const membership = await this.membershipRepo.findFirstActiveByUserId(
```

(The rest of `execute()` is unchanged. `executeForUser()` already has its own, separate `isEmailVerified()` check further down in the file — leave it as-is.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npx jest --testPathPatterns login.usecase.spec -v`
Expected: PASS, all 7 tests (the 5 pre-existing tests already set `emailVerifiedAt: new Date()` on their fixtures, so they're unaffected).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/auth/application/login.usecase.ts apps/backend/src/modules/auth/application/login.usecase.spec.ts
git commit -m "feat: block login for an unverified email"
```

---

### Task 7: `SignupUseCase` — switch to OTP, drop auto-login

**Files:**
- Modify: `apps/backend/src/modules/auth/application/signup.usecase.ts`
- Modify: `apps/backend/src/modules/auth/application/signup.usecase.spec.ts`

**Interfaces:**
- Consumes: `generateOtp()` (Task 1), `IAuthEmailSender.sendVerificationEmail(to, otp)` (Task 4).
- Produces: `SignupResult` no longer has `accessToken`/`refreshToken` fields. `SignupUseCase`'s constructor no longer takes a `LoginUseCase` parameter.

- [ ] **Step 1: Update the failing tests**

In `signup.usecase.spec.ts`:

1. Change the top-level assertion in the first test (`'creates the organization bootstrap and verification token before emailing it'`, currently lines 76-79):

```ts
    expect(emailSender.sendVerificationEmail).toHaveBeenCalledWith(
      'ap@congtyb.vn',
      expect.stringMatching(/^\d{6}$/),
    );
```

2. In that same test, remove `loginUseCase` entirely — delete the `const loginUseCase = {...}` block (lines 31-36) and remove its argument from the `new SignupUseCase(...)` call (it's the second-to-last positional argument, right before `dataSource`).

3. In the `'throws if the email is already registered'` test, the constructor call already passes `{}as any` placeholders for every unused param — remove one `{} as any` from the end of the list (it now takes one fewer constructor argument). Count carefully: the call currently has 11 positional args ending in `taxCodeLookup, memberNotificationSender, {} as any, {} as any` (the last two stood in for `loginUseCase, dataSource`) — drop one, leaving 10 args ending in `taxCodeLookup, memberNotificationSender, {} as any` (for `dataSource`).

4. In `buildCommonMocks()` (used by the three tax-code-verification tests), remove the `loginUseCase` field, and remove `common.loginUseCase as any` from all three `new SignupUseCase(...)` calls that reference it.

5. In `'creates an ACTIVE organization and logs in immediately when the tax code matches exactly'`: rename the test to `'creates an ACTIVE organization and sends the org-approved notification'`, remove `expect(result.accessToken).toBe('access-token');`, and keep the rest (organization status ACTIVE, `taxCodeMatched: true`, `sendOrganizationApprovedEmail` called).

6. In `'creates a PENDING_REVIEW organization and issues no tokens when the tax code does not match'`: remove the now-nonexistent `expect(common.loginUseCase.execute).not.toHaveBeenCalled();` line (keep `expect(result.accessToken).toBeUndefined()` and `expect(result.refreshToken).toBeUndefined()` — those still hold since the interface no longer has these fields at all, so they're `undefined` unconditionally).

The full rewritten spec file:

```ts
import { SignupUseCase } from './signup.usecase';

function buildTaxCodeMatchMocks(matchedName: string | null) {
  return {
    taxCodeLookup: {
      lookup: jest
        .fn()
        .mockResolvedValue(matchedName === null ? null : { name: matchedName }),
    },
    memberNotificationSender: {
      sendOrganizationApprovedEmail: jest.fn(),
      sendOrganizationRejectedEmail: jest.fn(),
    },
  };
}

describe('SignupUseCase', () => {
  it('creates the organization bootstrap and verification token before emailing it', async () => {
    const userRepo = {
      findByEmail: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
    };
    const organizationRepo = { save: jest.fn() };
    const membershipRepo = { save: jest.fn() };
    const verificationTokenRepo = { save: jest.fn() };
    const subscriptionRepo = { save: jest.fn() };
    const organizationBootstrap = { seed: jest.fn() };
    const emailSender = { sendVerificationEmail: jest.fn() };
    const { taxCodeLookup, memberNotificationSender } =
      buildTaxCodeMatchMocks('Company B');
    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: object) => Promise<void>) => callback({}),
      ),
    };

    const useCase = new SignupUseCase(
      userRepo as any,
      organizationRepo as any,
      membershipRepo as any,
      verificationTokenRepo as any,
      subscriptionRepo as any,
      organizationBootstrap as any,
      emailSender as any,
      taxCodeLookup as any,
      memberNotificationSender as any,
      dataSource as any,
    );

    const result = await useCase.execute({
      organizationName: 'Company B',
      name: 'An',
      email: 'AP@congtyb.vn',
      password: 'S3curePass!',
      taxCode: '0101234567',
    });

    expect(result.organization.name).toBe('Company B');
    expect(result.membership.role).toBe('OWNER');
    expect(userRepo.save).toHaveBeenCalled();
    expect(organizationRepo.save).toHaveBeenCalled();
    expect(membershipRepo.save).toHaveBeenCalled();
    expect(subscriptionRepo.save).toHaveBeenCalled();
    expect(organizationBootstrap.seed).toHaveBeenCalledWith(
      expect.any(String),
      expect.anything(),
    );
    expect(verificationTokenRepo.save).toHaveBeenCalled();
    expect(emailSender.sendVerificationEmail).toHaveBeenCalledWith(
      'ap@congtyb.vn',
      expect.stringMatching(/^\d{6}$/),
    );
  });

  it('throws if the email is already registered', async () => {
    const userRepo = {
      findByEmail: jest.fn().mockResolvedValue({ id: 'existing' }),
      save: jest.fn(),
    };
    const { taxCodeLookup, memberNotificationSender } =
      buildTaxCodeMatchMocks(null);
    const useCase = new SignupUseCase(
      userRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      taxCodeLookup as any,
      memberNotificationSender as any,
      {} as any,
    );

    await expect(
      useCase.execute({
        organizationName: 'X',
        name: 'X',
        email: 'dup@x.vn',
        password: 'password',
        taxCode: '0101234567',
      }),
    ).rejects.toMatchObject({
      errorCode: 'CONFLICT',
    });
  });
});

describe('SignupUseCase tax code verification', () => {
  function buildCommonMocks() {
    const userRepo = {
      findByEmail: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
    };
    const organizationRepo = { save: jest.fn() };
    const membershipRepo = { save: jest.fn() };
    const verificationTokenRepo = { save: jest.fn() };
    const subscriptionRepo = { save: jest.fn() };
    const organizationBootstrap = { seed: jest.fn() };
    const emailSender = { sendVerificationEmail: jest.fn() };
    const dataSource = {
      transaction: jest.fn((cb) => cb({})),
    };
    return {
      userRepo,
      organizationRepo,
      membershipRepo,
      verificationTokenRepo,
      subscriptionRepo,
      organizationBootstrap,
      emailSender,
      dataSource,
    };
  }

  it('creates an ACTIVE organization and sends the org-approved notification', async () => {
    const common = buildCommonMocks();
    const { taxCodeLookup, memberNotificationSender } =
      buildTaxCodeMatchMocks('ACME CO');
    const useCase = new SignupUseCase(
      common.userRepo as any,
      common.organizationRepo as any,
      common.membershipRepo as any,
      common.verificationTokenRepo as any,
      common.subscriptionRepo as any,
      common.organizationBootstrap as any,
      common.emailSender as any,
      taxCodeLookup as any,
      memberNotificationSender as any,
      common.dataSource as any,
    );

    const result = await useCase.execute({
      organizationName: 'Acme Co',
      name: 'An',
      email: 'an@acme.vn',
      password: 'S3curePass!',
      taxCode: '0101234567',
    });

    expect(result.organization.status).toBe('ACTIVE');
    expect(result.organization.taxCodeMatched).toBe(true);
    expect(
      memberNotificationSender.sendOrganizationApprovedEmail,
    ).toHaveBeenCalledWith('an@acme.vn', 'Acme Co');
  });

  it('creates a PENDING_REVIEW organization and sends no org-approved notification when the tax code does not match', async () => {
    const common = buildCommonMocks();
    const { taxCodeLookup, memberNotificationSender } = buildTaxCodeMatchMocks(
      'A Totally Different Co',
    );
    const useCase = new SignupUseCase(
      common.userRepo as any,
      common.organizationRepo as any,
      common.membershipRepo as any,
      common.verificationTokenRepo as any,
      common.subscriptionRepo as any,
      common.organizationBootstrap as any,
      common.emailSender as any,
      taxCodeLookup as any,
      memberNotificationSender as any,
      common.dataSource as any,
    );

    const result = await useCase.execute({
      organizationName: 'Acme Co',
      name: 'An',
      email: 'an@acme.vn',
      password: 'S3curePass!',
      taxCode: '0101234567',
    });

    expect(result.organization.status).toBe('PENDING_REVIEW');
    expect(
      memberNotificationSender.sendOrganizationApprovedEmail,
    ).not.toHaveBeenCalled();
  });

  it('creates a PENDING_REVIEW organization when the lookup fails', async () => {
    const common = buildCommonMocks();
    const { taxCodeLookup, memberNotificationSender } =
      buildTaxCodeMatchMocks(null);
    const useCase = new SignupUseCase(
      common.userRepo as any,
      common.organizationRepo as any,
      common.membershipRepo as any,
      common.verificationTokenRepo as any,
      common.subscriptionRepo as any,
      common.organizationBootstrap as any,
      common.emailSender as any,
      taxCodeLookup as any,
      memberNotificationSender as any,
      common.dataSource as any,
    );

    const result = await useCase.execute({
      organizationName: 'Acme Co',
      name: 'An',
      email: 'an@acme.vn',
      password: 'S3curePass!',
      taxCode: '0101234567',
    });

    expect(result.organization.status).toBe('PENDING_REVIEW');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/backend && npx jest --testPathPatterns signup.usecase.spec -v`
Expected: FAIL — constructor arg count mismatch and/or `sendVerificationEmail` still called with a URL string.

- [ ] **Step 3: Update the use case**

Replace the full contents of `signup.usecase.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  type ISubscriptionRepository,
  SUBSCRIPTION_REPOSITORY,
} from '../../billing/application/subscription-repository.port';
import { Subscription } from '../../billing/domain/subscription';
import {
  type IMembershipRepository,
  MEMBERSHIP_REPOSITORY,
} from '../../organizations/application/membership-repository.port';
import {
  type IOrganizationRepository,
  ORGANIZATION_REPOSITORY,
} from '../../organizations/application/organization-repository.port';
import { Membership, Role } from '../../organizations/domain/membership';
import { matchesTaxCodeName } from '../../organizations/domain/normalize-company-name';
import { Organization } from '../../organizations/domain/organization';
import {
  type ITaxCodeLookupAdapter,
  TAX_CODE_LOOKUP_ADAPTER,
} from '../../tax-verification/application/tax-code-lookup.port';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../users/application/user-repository.port';
import { User } from '../../users/domain/user';
import { EmailVerificationToken } from '../domain/email-verification-token';
import {
  AUTH_EMAIL_SENDER,
  type IAuthEmailSender,
} from './auth-email-sender.port';
import {
  EMAIL_VERIFICATION_TOKEN_REPOSITORY,
  type IEmailVerificationTokenRepository,
} from './email-verification-token-repository.port';
import {
  type IMemberNotificationSender,
  MEMBER_NOTIFICATION_SENDER,
} from './member-notification.port';
import {
  DEFAULT_ORGANIZATION_BOOTSTRAP,
  type IOrganizationBootstrap,
} from './organization-bootstrap.port';
import { hashPassword } from './password-hasher';
import { generateOtp } from './token-hasher';

export interface SignupInput {
  organizationName: string;
  name: string;
  email: string;
  password: string;
  taxCode: string;
}

export interface SignupResult {
  user: User;
  organization: Organization;
  membership: Membership;
}

const VERIFICATION_TOKEN_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class SignupUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepo: IOrganizationRepository,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: IMembershipRepository,
    @Inject(EMAIL_VERIFICATION_TOKEN_REPOSITORY)
    private readonly verificationTokenRepo: IEmailVerificationTokenRepository,
    @Inject(SUBSCRIPTION_REPOSITORY)
    private readonly subscriptionRepo: ISubscriptionRepository,
    @Inject(DEFAULT_ORGANIZATION_BOOTSTRAP)
    private readonly organizationBootstrap: IOrganizationBootstrap,
    @Inject(AUTH_EMAIL_SENDER)
    private readonly emailSender: IAuthEmailSender,
    @Inject(TAX_CODE_LOOKUP_ADAPTER)
    private readonly taxCodeLookup: ITaxCodeLookupAdapter,
    @Inject(MEMBER_NOTIFICATION_SENDER)
    private readonly memberNotificationSender: IMemberNotificationSender,
    private readonly dataSource: DataSource,
  ) {}

  async execute(input: SignupInput): Promise<SignupResult> {
    const email = input.email.trim().toLowerCase();
    if (await this.userRepo.findByEmail(email)) {
      throw new AppError(ErrorCode.CONFLICT, 'Email đã được đăng ký.');
    }

    const organizationName = input.organizationName.trim();
    const lookupResult = await this.taxCodeLookup.lookup(input.taxCode);
    const taxCodeMatched =
      lookupResult !== null &&
      matchesTaxCodeName(organizationName, lookupResult.name);

    const now = new Date();
    const user = new User({
      id: randomUUID(),
      name: input.name.trim(),
      email,
      passwordHash: await hashPassword(input.password),
      emailVerifiedAt: null,
      createdAt: now,
    });
    const organization = new Organization({
      id: randomUUID(),
      name: organizationName,
      status: taxCodeMatched ? 'ACTIVE' : 'PENDING_REVIEW',
      taxCode: input.taxCode,
      taxCodeMatched,
      taxCodeLookupName: lookupResult?.name ?? null,
      createdAt: now,
    });
    const membership = new Membership({
      id: randomUUID(),
      organizationId: organization.id,
      userId: user.id,
      role: Role.OWNER,
      invitedAt: now,
      joinedAt: now,
      createdAt: now,
    });

    await this.dataSource.transaction(async (manager) => {
      await this.organizationRepo.save(organization, manager);
      await this.userRepo.save(user, manager);
      await this.membershipRepo.save(membership, manager);
      await this.subscriptionRepo.save(
        Subscription.createFree(randomUUID(), organization.id, now),
        manager,
        organization.id,
      );
      await this.organizationBootstrap.seed(organization.id, manager);
    });

    const { otp, hash } = generateOtp();
    await this.verificationTokenRepo.save(
      new EmailVerificationToken({
        id: randomUUID(),
        userId: user.id,
        tokenHash: hash,
        expiresAt: new Date(now.getTime() + VERIFICATION_TOKEN_TTL_MS),
        createdAt: now,
      }),
    );
    await this.emailSender.sendVerificationEmail(user.email, otp);

    if (organization.status === 'ACTIVE') {
      await this.memberNotificationSender.sendOrganizationApprovedEmail(
        user.email,
        organization.name,
      );
    }

    return { user, organization, membership };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/backend && npx jest --testPathPatterns signup.usecase.spec -v`
Expected: PASS, all 5 tests.

- [ ] **Step 5: Type-check**

Run: `cd apps/backend && npx tsc --noEmit`
Expected: errors only in `auth.controller.ts` (still reading `result.accessToken`/`result.refreshToken` off the signup result — expected, fixed in Task 10) and `auth.controller.spec.ts` if it constructs `SignupUseCase` directly (check; fixed in Task 10 if so).

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/auth/application/signup.usecase.ts apps/backend/src/modules/auth/application/signup.usecase.spec.ts
git commit -m "feat: switch signup verification to OTP, drop auto-login before verification"
```

---

### Task 8: `ResendVerificationEmailUseCase` — switch to OTP

**Files:**
- Modify: `apps/backend/src/modules/auth/application/resend-verification-email.usecase.ts`
- Modify: `apps/backend/src/modules/auth/application/resend-verification-email.usecase.spec.ts`

**Interfaces:**
- Consumes: `generateOtp()` (Task 1), `IAuthEmailSender.sendVerificationEmail(to, otp)` (Task 4).

- [ ] **Step 1: Update the failing test**

In `resend-verification-email.usecase.spec.ts`, change the assertion (currently lines 39-42):

```ts
    expect(emailSender.sendVerificationEmail).toHaveBeenCalledWith(
      'person@casso.vn',
      expect.stringMatching(/^\d{6}$/),
    );
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest --testPathPatterns resend-verification-email.usecase.spec -v`
Expected: FAIL — received value is still a URL string.

- [ ] **Step 3: Update the use case**

Replace the full contents of `resend-verification-email.usecase.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../users/application/user-repository.port';
import { EmailVerificationToken } from '../domain/email-verification-token';
import {
  AUTH_EMAIL_SENDER,
  type IAuthEmailSender,
} from './auth-email-sender.port';
import {
  EMAIL_VERIFICATION_TOKEN_REPOSITORY,
  type IEmailVerificationTokenRepository,
} from './email-verification-token-repository.port';
import { generateOtp } from './token-hasher';

const VERIFICATION_TOKEN_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class ResendVerificationEmailUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    @Inject(EMAIL_VERIFICATION_TOKEN_REPOSITORY)
    private readonly verificationTokenRepo: IEmailVerificationTokenRepository,
    @Inject(AUTH_EMAIL_SENDER) private readonly emailSender: IAuthEmailSender,
    private readonly dataSource: DataSource,
  ) {}

  async execute(inputEmail: string): Promise<void> {
    const user = await this.userRepo.findByEmail(
      inputEmail.trim().toLowerCase(),
    );
    if (!user || user.isEmailVerified()) return;

    const { otp, hash } = generateOtp();
    await this.dataSource.transaction(async (manager) => {
      await this.verificationTokenRepo.deleteByUserId(user.id, manager);
      await this.verificationTokenRepo.save(
        new EmailVerificationToken({
          id: randomUUID(),
          userId: user.id,
          tokenHash: hash,
          expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS),
          createdAt: new Date(),
        }),
        manager,
      );
    });

    await this.emailSender.sendVerificationEmail(user.email, otp);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/backend && npx jest --testPathPatterns resend-verification-email.usecase.spec -v`
Expected: PASS, both tests.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/auth/application/resend-verification-email.usecase.ts apps/backend/src/modules/auth/application/resend-verification-email.usecase.spec.ts
git commit -m "feat: switch resend-verification-email to OTP"
```

---

### Task 9: `VerifyEmailUseCase` — email + otp, enumeration-safe

**Files:**
- Modify: `apps/backend/src/modules/auth/application/verify-email.usecase.ts`
- Modify: `apps/backend/src/modules/auth/application/verify-email.usecase.spec.ts`

**Interfaces:**
- Consumes: `hashOtp()` (Task 1), `IEmailVerificationTokenRepository.findByUserIdAndTokenHash()` (Task 3), `IUserRepository.findByEmail()` (existing).
- Produces: `VerifyEmailUseCase.execute(email: string, otp: string): Promise<LoginResult>` — signature change from `execute(rawToken: string)`, consumed by Task 10 (`auth.controller.ts`).

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `verify-email.usecase.spec.ts`:

```ts
import { User } from '../../users/domain/user';
import { EmailVerificationToken } from '../domain/email-verification-token';
import { hashOtp } from './token-hasher';
import { VerifyEmailUseCase } from './verify-email.usecase';

describe('VerifyEmailUseCase', () => {
  it('marks the user verified and deletes the token in one transaction', async () => {
    const otp = '482913';
    const token = new EmailVerificationToken({
      id: 'tok-1',
      userId: 'user-1',
      tokenHash: hashOtp(otp),
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
    });
    const user = new User({
      id: 'user-1',
      name: 'An',
      email: 'a@b.vn',
      passwordHash: 'h',
      emailVerifiedAt: null,
      createdAt: new Date(),
    });
    const tokenRepo = {
      findByUserIdAndTokenHash: jest.fn().mockResolvedValue(token),
      deleteById: jest.fn(),
    };
    const userRepo = {
      findByEmail: jest.fn().mockResolvedValue(user),
      save: jest.fn(),
    };
    const loginUseCase = {
      executeForUser: jest.fn().mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      }),
    };
    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: object) => Promise<void>) => callback({}),
      ),
    };

    const useCase = new VerifyEmailUseCase(
      tokenRepo as any,
      userRepo as any,
      dataSource as any,
      loginUseCase as any,
    );
    await expect(useCase.execute('a@b.vn', otp)).resolves.toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });

    expect(userRepo.findByEmail).toHaveBeenCalledWith('a@b.vn');
    expect(tokenRepo.findByUserIdAndTokenHash).toHaveBeenCalledWith(
      'user-1',
      hashOtp(otp),
    );
    expect(userRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ emailVerifiedAt: expect.any(Date) }),
      expect.anything(),
    );
    expect(tokenRepo.deleteById).toHaveBeenCalledWith(
      'tok-1',
      expect.anything(),
    );
    expect(loginUseCase.executeForUser).toHaveBeenCalledWith('user-1');
  });

  it('throws a generic error when the code is expired', async () => {
    const otp = '111222';
    const token = new EmailVerificationToken({
      id: 'tok-2',
      userId: 'user-1',
      tokenHash: hashOtp(otp),
      expiresAt: new Date(Date.now() - 60_000),
      createdAt: new Date(),
    });
    const userRepo = {
      findByEmail: jest.fn().mockResolvedValue(
        new User({
          id: 'user-1',
          name: 'An',
          email: 'a@b.vn',
          passwordHash: 'h',
          emailVerifiedAt: null,
          createdAt: new Date(),
        }),
      ),
    };
    const useCase = new VerifyEmailUseCase(
      { findByUserIdAndTokenHash: jest.fn().mockResolvedValue(token) } as any,
      userRepo as any,
      {} as any,
      {} as any,
    );

    await expect(useCase.execute('a@b.vn', otp)).rejects.toMatchObject({
      errorCode: 'UNAUTHORIZED',
    });
  });

  it('throws the same generic error for a wrong code', async () => {
    const userRepo = {
      findByEmail: jest.fn().mockResolvedValue(
        new User({
          id: 'user-1',
          name: 'An',
          email: 'a@b.vn',
          passwordHash: 'h',
          emailVerifiedAt: null,
          createdAt: new Date(),
        }),
      ),
    };
    const useCase = new VerifyEmailUseCase(
      { findByUserIdAndTokenHash: jest.fn().mockResolvedValue(null) } as any,
      userRepo as any,
      {} as any,
      {} as any,
    );

    await expect(useCase.execute('a@b.vn', '999999')).rejects.toMatchObject({
      errorCode: 'UNAUTHORIZED',
    });
  });

  it('throws the same generic error for a nonexistent email, without querying the token repo', async () => {
    const tokenRepo = { findByUserIdAndTokenHash: jest.fn() };
    const userRepo = { findByEmail: jest.fn().mockResolvedValue(null) };
    const useCase = new VerifyEmailUseCase(
      tokenRepo as any,
      userRepo as any,
      {} as any,
      {} as any,
    );

    await expect(
      useCase.execute('missing@b.vn', '123456'),
    ).rejects.toMatchObject({ errorCode: 'UNAUTHORIZED' });
    expect(tokenRepo.findByUserIdAndTokenHash).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/backend && npx jest --testPathPatterns verify-email.usecase.spec -v`
Expected: FAIL — `useCase.execute` still expects a single `rawToken` argument and calls `findByTokenHash`, not `findByUserIdAndTokenHash`.

- [ ] **Step 3: Update the use case**

Replace the full contents of `verify-email.usecase.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../users/application/user-repository.port';
import {
  EMAIL_VERIFICATION_TOKEN_REPOSITORY,
  type IEmailVerificationTokenRepository,
} from './email-verification-token-repository.port';
import { type LoginResult, LoginUseCase } from './login.usecase';
import { hashOtp } from './token-hasher';

@Injectable()
export class VerifyEmailUseCase {
  constructor(
    @Inject(EMAIL_VERIFICATION_TOKEN_REPOSITORY)
    private readonly tokenRepo: IEmailVerificationTokenRepository,
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    private readonly dataSource: DataSource,
    private readonly loginUseCase: LoginUseCase,
  ) {}

  async execute(email: string, otp: string): Promise<LoginResult> {
    const user = await this.userRepo.findByEmail(email.trim().toLowerCase());
    const token = user
      ? await this.tokenRepo.findByUserIdAndTokenHash(user.id, hashOtp(otp))
      : null;

    if (!user || !token || token.isExpired(new Date())) {
      // Same error whether the email doesn't exist, the code is wrong, or it
      // expired — never let a caller distinguish "no such email" from
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
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/backend && npx jest --testPathPatterns verify-email.usecase.spec -v`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/auth/application/verify-email.usecase.ts apps/backend/src/modules/auth/application/verify-email.usecase.spec.ts
git commit -m "feat: verify email by (email, otp) with an enumeration-safe error"
```

---

### Task 10: Presentation — DTO, controller, Swagger docs

**Files:**
- Modify: `apps/backend/src/modules/auth/presentation/dto/verify-email.dto.ts`
- Modify: `apps/backend/src/modules/auth/presentation/auth.controller.ts`
- Modify: `apps/backend/src/modules/auth/presentation/auth.controller.spec.ts`

**Interfaces:**
- Consumes: `VerifyEmailUseCase.execute(email, otp)` (Task 9), `SignupResult` without tokens (Task 7).

- [ ] **Step 1: Update the DTO**

Replace the full contents of `verify-email.dto.ts`:

```ts
import { IsEmail, Matches } from 'class-validator';

export class VerifyEmailDto {
  @IsEmail()
  email: string;

  @Matches(/^\d{6}$/, { message: 'Mã OTP phải gồm 6 chữ số.' })
  otp: string;
}
```

- [ ] **Step 2: Write the failing controller test**

In `auth.controller.spec.ts`, replace the existing `'returns a session and sets the refresh cookie after email verification'` test (currently around lines 13-47):

```ts
  it('returns a session and sets the refresh cookie after email verification', async () => {
    const verifyEmailUseCase = {
      execute: jest.fn().mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      }),
    };
    const response = { cookie: jest.fn() };
    const controller = new AuthController(
      {} as never,
      verifyEmailUseCase as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: jest.fn().mockReturnValue('development') } as never,
    );

    await expect(
      controller.verifyEmail(
        { email: 'new@casso.vn', otp: '482913' },
        response as never,
      ),
    ).resolves.toEqual({ verified: true, accessToken: 'access-token' });
    expect(verifyEmailUseCase.execute).toHaveBeenCalledWith(
      'new@casso.vn',
      '482913',
    );
    expect(response.cookie).toHaveBeenCalledWith(
      'refreshToken',
      'refresh-token',
      expect.objectContaining({ httpOnly: true }),
    );
  });
```

(Only the `controller.verifyEmail(...)` call args and the added `expect(verifyEmailUseCase.execute)...` assertion change — the constructor call, `AuthController` positional args, and everything else in this test stay exactly as they are.)

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/backend && npx jest --testPathPatterns auth.controller.spec -v -t "returns a session"`
Expected: FAIL — type error / call shape mismatch (`verifyEmail` still expects `{ token: string }`).

- [ ] **Step 4: Update the controller**

In `auth.controller.ts`, replace the `signup` handler (drop the now-unused `@Res` cookie logic and the `accessToken` spread):

```ts
  @Public()
  @UseGuards(AuthCompositeRateLimitGuard)
  @Post('signup')
  @ApiOperation({ summary: 'Sign up a new user and organization' })
  @ApiCreatedResponse({
    description:
      'Account created. Email verification (a 6-digit OTP) is required before login, regardless of organization status.',
    schema: {
      type: 'object',
      required: ['userId', 'organizationId', 'organizationStatus'],
      properties: {
        userId: { type: 'string', format: 'uuid' },
        organizationId: { type: 'string', format: 'uuid' },
        organizationStatus: {
          type: 'string',
          enum: ['ACTIVE', 'PENDING_REVIEW'],
        },
      },
    },
  })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.CONFLICT,
    ErrorCode.RATE_LIMIT_EXCEEDED,
  )
  async signup(@Body() dto: SignupDto) {
    const result = await this.signupUseCase.execute(dto);
    return {
      userId: result.user.id,
      organizationId: result.organization.id,
      organizationStatus: result.organization.status,
    };
  }
```

Then replace the `verifyEmail` handler:

```ts
  @Public()
  @UseGuards(AuthCompositeRateLimitGuard)
  @HttpCode(HttpStatus.OK)
  @Post('verify-email')
  @ApiOperation({ summary: 'Verify an email with a 6-digit OTP' })
  @ApiOkResponse({
    description: 'Email verified',
    schema: {
      type: 'object',
      required: ['verified', 'accessToken'],
      properties: {
        verified: { type: 'boolean', example: true },
        accessToken: { type: 'string' },
      },
    },
  })
  @ApiErrorResponse(ErrorCode.VALIDATION_ERROR, ErrorCode.UNAUTHORIZED)
  async verifyEmail(
    @Body() dto: VerifyEmailDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.verifyEmailUseCase.execute(dto.email, dto.otp);
    response.cookie(
      REFRESH_COOKIE_NAME,
      result.refreshToken,
      this.refreshCookieOptions,
    );
    return { verified: true, accessToken: result.accessToken };
  }
```

(`@UseGuards(AuthCompositeRateLimitGuard)` is new on `verify-email` — it wasn't there before because a random opaque token didn't need brute-force protection; a 6-digit code does. This is the rate limit the design spec relies on.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/backend && npx jest --testPathPatterns auth.controller.spec -v`
Expected: PASS, every test in the file (check no other test in this file constructs `SignupUseCase` directly or asserts on the old signup response shape — if one does, update it the same way: drop `accessToken`/`refreshToken` expectations).

- [ ] **Step 6: Type-check the whole backend**

Run: `cd apps/backend && npx tsc --noEmit`
Expected: PASS, zero errors.

- [ ] **Step 7: Run the full backend suite**

Run: `cd apps/backend && npx jest`
Expected: PASS, all suites (this is the first point where every backend piece of this feature is wired together — a good checkpoint to also run `npx biome check --write .` from the repo root and `/domain-check` per AGENTS.md before moving to frontend work).

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/modules/auth/presentation/dto/verify-email.dto.ts apps/backend/src/modules/auth/presentation/auth.controller.ts apps/backend/src/modules/auth/presentation/auth.controller.spec.ts
git commit -m "feat: verify-email accepts (email, otp); signup no longer returns tokens"
```

---

### Task 11: Frontend — `maskEmail()` helper

**Files:**
- Create: `apps/frontend/src/lib/mask-email.ts`
- Create: `apps/frontend/src/lib/mask-email.spec.ts`

**Interfaces:**
- Produces: `maskEmail(email: string): string` — consumed by Task 12 (`EmailOtpStep`).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { maskEmail } from './mask-email';

describe('maskEmail', () => {
  it('keeps the first 4 characters of the local part and masks the rest', () => {
    expect(maskEmail('lengocanh@gmail.com')).toBe('leng***@gmail.com');
  });

  it('masks a short local part entirely rather than going negative', () => {
    expect(maskEmail('ab@x.vn')).toBe('ab***@x.vn');
  });

  it('returns the input unchanged when it has no @', () => {
    expect(maskEmail('not-an-email')).toBe('not-an-email');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && npx vitest run src/lib/mask-email.spec.ts`
Expected: FAIL — `Cannot find module './mask-email'`.

- [ ] **Step 3: Implement**

```ts
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at === -1) return email;

  const local = email.slice(0, at);
  const domain = email.slice(at);
  const visible = local.slice(0, Math.min(4, local.length));
  return `${visible}***${domain}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && npx vitest run src/lib/mask-email.spec.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/lib/mask-email.ts apps/frontend/src/lib/mask-email.spec.ts
git commit -m "feat: add maskEmail helper for the OTP hint"
```

---

### Task 12: Frontend — shared `EmailOtpStep` component

**Files:**
- Create: `apps/frontend/src/features/auth/components/email-otp-step.tsx`
- Create: `apps/frontend/src/features/auth/components/email-otp-step.spec.tsx`

**Interfaces:**
- Consumes: `maskEmail()` (Task 11), `OtpInput` (`@/components/shared/otp-input`, existing, unchanged), `apiRequest`/`getApiErrorCode`/`getApiErrorMessage` (`@/lib/api-client`, existing).
- Produces: `EmailOtpStep` component — `props: { email: string; onVerified: (result: { accessToken: string }) => void }`. Calls `POST /api/v1/auth/verify-email` with `{ email, otp }` and `POST /api/v1/auth/resend-verification` with `{ email }`. Consumed by Task 13 (`SignupPage`) and Task 14 (`VerifyEmailPage`).

This component owns the network calls directly via `apiRequest` (matching the existing pattern in `SignupPage`/`LoginPage`/old `VerifyEmailPage` — this codebase's `auth` feature does not use a `features/auth/api/` hooks layer; don't introduce one here).

**Why the pending-review/rejected states live here, not in the parent pages:** the backend's `verify-email` use case (Task 9) verifies the email *and then* logs the user in via `LoginUseCase.executeForUser()`, which independently checks the organization's status — so `POST /api/v1/auth/verify-email` can fail with `ORGANIZATION_PENDING_REVIEW` or `ORGANIZATION_REJECTED` even when the OTP the user typed was completely correct. If this component treated every non-success response as "wrong code," a user who typed the right code would incorrectly see "mã không hợp lệ." Both `SignupPage` and `VerifyEmailPage` need this exact same three-state handling (otp entry / pending-review / rejected), so it belongs once in this shared component rather than duplicated in both pages.

- [ ] **Step 1: Write the failing test**

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailOtpStep } from './email-otp-step';

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));

vi.mock('@/lib/api-client', async () => {
  const { getApiErrorCode, getApiErrorMessage } = await import(
    '@/test/api-error-mock'
  );
  return { apiRequest, getApiErrorCode, getApiErrorMessage };
});

function fillOtp(code: string) {
  const boxes = screen.getAllByRole('textbox');
  code.split('').forEach((digit, i) => {
    fireEvent.change(boxes[i], { target: { value: digit } });
  });
}

describe('EmailOtpStep', () => {
  beforeEach(() => {
    apiRequest.mockReset();
  });

  it('shows a masked-email hint, never an editable email field', () => {
    render(<EmailOtpStep email="lengocanh@gmail.com" onVerified={vi.fn()} />);

    expect(screen.getByText(/leng\*\*\*@gmail\.com/)).toBeVisible();
    expect(screen.queryByRole('textbox', { name: /email/i })).toBeNull();
  });

  it('confirms the OTP and calls onVerified with the session', async () => {
    apiRequest.mockResolvedValueOnce({
      verified: true,
      accessToken: 'access-token',
    });
    const onVerified = vi.fn();

    render(
      <EmailOtpStep email="lengocanh@gmail.com" onVerified={onVerified} />,
    );
    fillOtp('482913');
    fireEvent.click(screen.getByRole('button', { name: /xác nhận/i }));

    await waitFor(() =>
      expect(onVerified).toHaveBeenCalledWith({
        verified: true,
        accessToken: 'access-token',
      }),
    );
    expect(apiRequest).toHaveBeenCalledWith({
      url: '/api/v1/auth/verify-email',
      method: 'POST',
      data: { email: 'lengocanh@gmail.com', otp: '482913' },
    });
  });

  it('shows an inline error for an invalid or expired code', async () => {
    apiRequest.mockRejectedValueOnce({
      response: { data: { errorCode: 'UNAUTHORIZED' } },
    });

    render(<EmailOtpStep email="lengocanh@gmail.com" onVerified={vi.fn()} />);
    fillOtp('000000');
    fireEvent.click(screen.getByRole('button', { name: /xác nhận/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/mã không hợp lệ hoặc đã hết hạn/i),
      ).toBeVisible(),
    );
  });

  it('resends a fresh code', async () => {
    apiRequest.mockResolvedValueOnce({ success: true });

    render(<EmailOtpStep email="lengocanh@gmail.com" onVerified={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /gửi lại mã/i }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith({
        url: '/api/v1/auth/resend-verification',
        method: 'POST',
        data: { email: 'lengocanh@gmail.com' },
      }),
    );
  });

  it('shows a pending-review state (not "wrong code") when the code was correct but the org is pending', async () => {
    apiRequest.mockRejectedValueOnce({
      response: {
        data: {
          errorCode: 'ORGANIZATION_PENDING_REVIEW',
          message: 'Tổ chức của bạn đang chờ được duyệt.',
        },
      },
    });
    const onVerified = vi.fn();

    render(
      <EmailOtpStep email="lengocanh@gmail.com" onVerified={onVerified} />,
    );
    fillOtp('482913');
    fireEvent.click(screen.getByRole('button', { name: /xác nhận/i }));

    await waitFor(() =>
      expect(screen.getByText(/email đã được xác minh/i)).toBeVisible(),
    );
    expect(
      screen.queryByText(/mã không hợp lệ hoặc đã hết hạn/i),
    ).not.toBeInTheDocument();
    expect(onVerified).not.toHaveBeenCalled();
  });

  it('shows a rejected state with the API message', async () => {
    apiRequest.mockRejectedValueOnce({
      response: {
        data: {
          errorCode: 'ORGANIZATION_REJECTED',
          message: 'Đăng ký tổ chức của bạn chưa được chấp thuận.',
        },
      },
    });

    render(<EmailOtpStep email="lengocanh@gmail.com" onVerified={vi.fn()} />);
    fillOtp('482913');
    fireEvent.click(screen.getByRole('button', { name: /xác nhận/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/đăng ký tổ chức của bạn chưa được chấp thuận/i),
      ).toBeVisible(),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && npx vitest run src/features/auth/components/email-otp-step.spec.tsx`
Expected: FAIL — `Cannot find module './email-otp-step'`.

- [ ] **Step 3: Implement**

```tsx
import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { OtpInput } from '@/components/shared/otp-input';
import { Button } from '@/components/ui/button';
import { InlineFormError } from '@/components/ui/inline-form-error';
import { Spinner } from '@/components/ui/spinner';
import {
  apiRequest,
  getApiErrorCode,
  getApiErrorMessage,
} from '@/lib/api-client';
import { maskEmail } from '@/lib/mask-email';

interface VerifyEmailResult {
  verified: boolean;
  accessToken: string;
}

interface EmailOtpStepProps {
  email: string;
  onVerified: (result: VerifyEmailResult) => void;
}

const DEFAULT_REJECTED_MESSAGE =
  'Đăng ký tổ chức của bạn chưa được chấp thuận.';

type StepState = 'otp' | 'pending-review' | 'rejected';

export function EmailOtpStep({ email, onVerified }: EmailOtpStepProps) {
  const [state, setState] = useState<StepState>('otp');
  const [otp, setOtp] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resendSent, setResendSent] = useState(false);
  const [rejectedMessage, setRejectedMessage] = useState(
    DEFAULT_REJECTED_MESSAGE,
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setConfirming(true);
    setConfirmError(null);

    try {
      const result = await apiRequest<VerifyEmailResult>({
        url: '/api/v1/auth/verify-email',
        method: 'POST',
        data: { email, otp },
      });
      onVerified(result);
    } catch (error) {
      const errorCode = getApiErrorCode(error);
      if (errorCode === 'ORGANIZATION_PENDING_REVIEW') {
        setState('pending-review');
        return;
      }
      if (errorCode === 'ORGANIZATION_REJECTED') {
        setRejectedMessage(
          getApiErrorMessage(error) ?? DEFAULT_REJECTED_MESSAGE,
        );
        setState('rejected');
        return;
      }
      setConfirmError(
        errorCode === 'UNAUTHORIZED'
          ? 'Mã không hợp lệ hoặc đã hết hạn. Vui lòng thử lại hoặc gửi lại mã.'
          : (getApiErrorMessage(error) ?? 'Đã xảy ra lỗi. Vui lòng thử lại.'),
      );
    } finally {
      setConfirming(false);
    }
  }

  async function onResend() {
    setResending(true);
    setResendSent(false);
    try {
      await apiRequest({
        url: '/api/v1/auth/resend-verification',
        method: 'POST',
        data: { email },
      });
      setResendSent(true);
    } finally {
      setResending(false);
    }
  }

  if (state === 'pending-review') {
    return (
      <div role="status" className="space-y-2 text-center">
        <h2 className="text-lg font-semibold">Email đã được xác minh</h2>
        <p className="text-sm text-muted-foreground">
          Tổ chức của bạn đang chờ được duyệt — chúng tôi sẽ gửi email khi có
          kết quả.
        </p>
        <Link
          to="/login"
          className="text-primary pointer-hover:hover:underline"
        >
          Đến trang đăng nhập
        </Link>
      </div>
    );
  }

  if (state === 'rejected') {
    return (
      <div role="alert" className="space-y-2 text-center">
        <h2 className="text-lg font-semibold">
          Đăng ký chưa được chấp thuận
        </h2>
        <p className="text-sm text-muted-foreground">{rejectedMessage}</p>
        <Link
          to="/login"
          className="text-primary pointer-hover:hover:underline"
        >
          Đến trang đăng nhập
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 text-left">
      <p className="text-sm text-muted-foreground">
        Mã đã được gửi tới email{' '}
        <span className="font-medium text-foreground">
          {maskEmail(email)}
        </span>
        . Vui lòng nhập mã bên dưới.
      </p>

      <OtpInput value={otp} onChange={setOtp} />

      <InlineFormError message={confirmError} />
      {resendSent && (
        <p className="text-sm text-muted-foreground" role="status">
          Đã gửi lại mã. Hãy kiểm tra hộp thư của bạn.
        </p>
      )}

      <Button
        type="submit"
        disabled={otp.length !== 6 || confirming}
        aria-busy={confirming}
        className="w-full"
      >
        {confirming && <Spinner />}
        {confirming ? 'Đang xác nhận…' : 'Xác nhận'}
      </Button>

      <Button
        type="button"
        variant="link"
        className="h-auto p-0 text-sm"
        onClick={onResend}
        disabled={resending}
      >
        {resending ? 'Đang gửi…' : 'Gửi lại mã'}
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && npx vitest run src/features/auth/components/email-otp-step.spec.tsx`
Expected: PASS, all 6 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/auth/components/email-otp-step.tsx apps/frontend/src/features/auth/components/email-otp-step.spec.tsx
git commit -m "feat: add shared EmailOtpStep component"
```

---

### Task 13: Frontend — `SignupPage` shows the OTP step inline

**Files:**
- Modify: `apps/frontend/src/features/auth/pages/signup-page.tsx`

**Interfaces:**
- Consumes: `EmailOtpStep` (Task 12), `authTokenManager` (`@/lib/api-client`, existing), `useAuth().refreshUser` (`@/contexts/auth-context`, existing).

- [ ] **Step 1: Update the component**

Replace the full contents of `signup-page.tsx`:

```tsx
import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { InlineFormError } from '@/components/ui/inline-form-error';
import { Spinner } from '@/components/ui/spinner';
import { useAuth } from '@/contexts/auth-context';
import { apiRequest, authTokenManager } from '@/lib/api-client';
import { AuthLogoLink } from '../components/auth-logo-link';
import { EmailOtpStep } from '../components/email-otp-step';

const TAX_CODE_PATTERN = /^\d{10}(\d{3})?$/;

export function SignupPage() {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const [step, setStep] = useState<'form' | 'otp'>('form');
  const [organizationName, setOrganizationName] = useState('');
  const [taxCode, setTaxCode] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!TAX_CODE_PATTERN.test(taxCode.trim())) {
      setError('Mã số thuế phải gồm 10 hoặc 13 chữ số.');
      return;
    }

    setSubmitting(true);
    try {
      authTokenManager.resetLogoutState();
      await apiRequest({
        url: '/api/v1/auth/signup',
        method: 'POST',
        data: { organizationName, name, email, password, taxCode },
      });
      toast.success('Tạo tài khoản thành công.');
      setStep('otp');
    } catch {
      setError('Không thể tạo tài khoản. Vui lòng kiểm tra thông tin.');
    } finally {
      setSubmitting(false);
    }
  }

  async function onVerified(result: { accessToken: string }) {
    authTokenManager.setAccessToken(result.accessToken);
    await refreshUser();
    navigate('/onboarding', { replace: true });
  }

  if (step === 'otp') {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6">
        <AuthLogoLink />
        <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">
          <h1 className="mb-4 text-xl font-semibold">Xác thực email</h1>
          <EmailOtpStep email={email} onVerified={onVerified} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 p-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-xl border bg-card p-6 shadow-sm"
      >
        <AuthLogoLink />

        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Tạo tài khoản</h1>
          <p className="text-sm text-muted-foreground">
            Bắt đầu quản lý công nợ cho doanh nghiệp của bạn.
          </p>
        </div>

        <label className="block space-y-1">
          <span className="text-sm font-medium">Tên tổ chức</span>
          <input
            name="organizationName"
            required
            autoComplete="organization"
            placeholder="VD: Công ty TNHH ABC"
            value={organizationName}
            onChange={(event) => setOrganizationName(event.target.value)}
            className="h-10 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">Mã số thuế</span>
          <input
            name="taxCode"
            required
            inputMode="numeric"
            maxLength={13}
            placeholder="VD: 0101234567"
            value={taxCode}
            onChange={(event) => setTaxCode(event.target.value)}
            className="h-10 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">Họ và tên</span>
          <input
            name="name"
            required
            autoComplete="name"
            placeholder="VD: Nguyễn Văn A"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="h-10 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">Email</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            spellCheck={false}
            placeholder="ban@congty.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="h-10 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">Mật khẩu</span>
          <input
            type="password"
            name="password"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="Ít nhất 8 ký tự"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-10 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        <InlineFormError message={error} />

        <Button
          type="submit"
          disabled={submitting}
          aria-busy={submitting}
          className="w-full"
        >
          {submitting && <Spinner />}
          {submitting ? 'Đang xử lý…' : 'Tạo tài khoản'}
        </Button>

        <p className="text-sm">
          Đã có tài khoản?{' '}
          <Link
            to="/login"
            className="text-primary pointer-hover:hover:underline"
          >
            Đăng nhập
          </Link>
        </p>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Manually verify against `signup-page.spec.tsx`**

Run: `cd apps/frontend && npx vitest run src/features/auth/pages/signup-page.spec.tsx`
Expected: this file may fail now (it likely asserts the old `navigate('/verify-email?...')` behavior) — read the failures. If it does, this is expected: `signup-page.spec.tsx`'s "navigates to verify-email" style assertions get superseded by the rewritten `signup-verify.spec.tsx` in Task 16. Note which specific assertions fail here so Task 16 covers them; don't fix this file in this task (it may end up deleted/merged into Task 16's file — decide there once both pages are updated).

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/features/auth/pages/signup-page.tsx
git commit -m "feat: show the OTP step inline on SignupPage instead of navigating away"
```

---

### Task 14: Frontend — `VerifyEmailPage` becomes the OTP fallback

**Files:**
- Modify: `apps/frontend/src/features/auth/pages/verify-email-page.tsx`

**Interfaces:**
- Consumes: `EmailOtpStep` (Task 12).

- [ ] **Step 1: Update the component**

Replace the full contents of `verify-email-page.tsx`:

`EmailOtpStep` (Task 12) already owns the pending-review/rejected states internally, so this page stays a thin wrapper — resist the urge to re-add that handling here.

```tsx
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/auth-context';
import { authTokenManager } from '@/lib/api-client';
import { AuthLogoLink } from '../components/auth-logo-link';
import { EmailOtpStep } from '../components/email-otp-step';

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const email = searchParams.get('email') ?? '';

  async function onVerified(result: { accessToken: string }) {
    authTokenManager.setAccessToken(result.accessToken);
    await refreshUser();
    navigate('/onboarding', { replace: true });
  }

  if (!email) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 text-center">
        <AuthLogoLink />
        <div role="alert" className="space-y-2">
          <h1 className="text-xl font-semibold">Thiếu thông tin email</h1>
          <p className="text-sm text-muted-foreground">
            Vui lòng đăng ký hoặc đăng nhập lại để nhận mã xác thực mới.
          </p>
          <Link
            to="/login"
            className="text-primary pointer-hover:hover:underline"
          >
            Đến trang đăng nhập
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6">
      <AuthLogoLink />
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">
        <h1 className="mb-4 text-xl font-semibold">Xác thực email</h1>
        <EmailOtpStep email={email} onVerified={onVerified} />
        <Button variant="link" className="mt-4 h-auto p-0 text-sm" asChild>
          <Link to="/login">← Quay lại đăng nhập</Link>
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/features/auth/pages/verify-email-page.tsx
git commit -m "feat: VerifyEmailPage is now the OTP fallback screen, no free-text email input"
```

(Both `signup-page.spec.tsx` and the old `signup-verify.spec.tsx` are broken at this point by design — Task 16 rewrites them together, since they exercise both pages' interaction.)

---

### Task 15: Frontend — `LoginPage` redirects on `EMAIL_NOT_VERIFIED`

**Files:**
- Modify: `apps/frontend/src/features/auth/pages/login-page.tsx`
- Modify: `apps/frontend/src/features/auth/pages/login-page.spec.tsx`

**Interfaces:**
- Consumes: `ErrorCode.EMAIL_NOT_VERIFIED` (Task 5, as a string literal — the frontend doesn't import the backend enum, it matches on the string like the existing `ORGANIZATION_STATUS_ERROR_CODES` set does).

- [ ] **Step 1: Write the failing test**

Add to `login-page.spec.tsx`, inside `describe('LoginPage', ...)`, after the `'toasts and stays on the page when the organization is pending review'` test:

```ts
  it('redirects to the OTP screen when the email is not verified', async () => {
    apiRequest.mockRejectedValue({
      response: {
        data: {
          errorCode: 'EMAIL_NOT_VERIFIED',
          message: 'Email chưa được xác thực.',
        },
      },
    });

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/verify-email" element={<div>verify-email screen</div>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByLabelText(/email/i)).toBeVisible());
    fillAndSubmit();

    await waitFor(() =>
      expect(screen.getByText('verify-email screen')).toBeVisible(),
    );
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && npx vitest run src/features/auth/pages/login-page.spec.tsx`
Expected: FAIL — no navigation happens; `LoginPage` still shows "Email hoặc mật khẩu không đúng." for this error code.

- [ ] **Step 3: Update the component**

In `login-page.tsx`, replace the `catch` block in `onSubmit`:

```ts
    } catch (submitError) {
      const errorCode = getApiErrorCode(submitError);
      if (errorCode === 'EMAIL_NOT_VERIFIED') {
        navigate(`/verify-email?email=${encodeURIComponent(email.trim())}`);
        return;
      }
      if (errorCode && ORGANIZATION_STATUS_ERROR_CODES.has(errorCode)) {
        toast.error(
          getApiErrorMessage(submitError) ??
            'Tổ chức của bạn hiện không thể sử dụng dịch vụ.',
        );
      } else {
        setError('Email hoặc mật khẩu không đúng.');
      }
    } finally {
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/frontend && npx vitest run src/features/auth/pages/login-page.spec.tsx`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/auth/pages/login-page.tsx apps/frontend/src/features/auth/pages/login-page.spec.tsx
git commit -m "feat: LoginPage redirects to the OTP screen on EMAIL_NOT_VERIFIED"
```

---

### Task 16: Frontend — rewrite the signup ↔ verify-email integration tests

**Files:**
- Modify: `apps/frontend/src/features/auth/pages/signup-verify.spec.tsx`
- Modify: `apps/frontend/src/features/auth/pages/signup-page.spec.tsx` (only if it still asserts old navigation behavior after Task 13 — check first)

**Interfaces:** none new — this task locks in end-to-end coverage of Tasks 12-14 working together.

- [ ] **Step 1: Check `signup-page.spec.tsx` for stale assertions**

Run: `cd apps/frontend && npx vitest run src/features/auth/pages/signup-page.spec.tsx`

If it fails only on the removed `navigate('/verify-email?...')` behavior (e.g. asserting `mockNavigate` was called with a `/verify-email` URL), update those specific assertions to instead assert the OTP step renders inline (`screen.getByText(/mã đã được gửi tới email/i)`). If it fails on something unrelated, read the diff and fix precisely that — don't guess.

- [ ] **Step 2: Replace `signup-verify.spec.tsx`**

Replace the full contents:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/contexts/auth-context';
import { GuestRoute } from '@/routes/protected-route';
import { SignupPage } from './signup-page';
import { VerifyEmailPage } from './verify-email-page';

const { getValidAccessToken, apiRequest } = vi.hoisted(() => ({
  getValidAccessToken: vi.fn(),
  apiRequest: vi.fn(),
}));

vi.mock('@/lib/api-client', async () => {
  const { getApiErrorCode, getApiErrorMessage } = await import(
    '@/test/api-error-mock'
  );
  return {
    authTokenManager: {
      getValidAccessToken,
      hasKnownSession: () => true,
      setAccessToken: vi.fn(),
      resetLogoutState: vi.fn(),
      markLogoutInitiated: vi.fn(),
      clearStaleRefreshSession: vi.fn(),
    },
    apiRequest,
    getApiErrorCode,
    getApiErrorMessage,
  };
});

const user = {
  id: 'user-1',
  email: 'new@casso.vn',
  name: 'New User',
  role: 'OWNER',
  organizationId: 'org-1',
  organizationName: 'Casso Ledger',
  subscriptionPlan: 'FREE',
  bankingLinked: true,
};

function fillOtp(code: string) {
  const boxes = screen.getAllByRole('textbox');
  code.split('').forEach((digit, i) => {
    fireEvent.change(boxes[i], { target: { value: digit } });
  });
}

describe('signup and email verification', () => {
  beforeEach(() => {
    getValidAccessToken.mockReset();
    apiRequest.mockReset();
    getValidAccessToken.mockResolvedValue(null);
  });

  it('shows the OTP step inline after signup, without navigating away', async () => {
    apiRequest.mockResolvedValueOnce({
      userId: 'user-1',
      organizationId: 'org-1',
      organizationStatus: 'PENDING_REVIEW',
    });

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/signup']}>
          <Routes>
            <Route
              path="/signup"
              element={
                <GuestRoute>
                  <SignupPage />
                </GuestRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByLabelText(/tên tổ chức/i)).toBeVisible(),
    );
    fireEvent.change(screen.getByLabelText(/tên tổ chức/i), {
      target: { value: 'Casso Ledger' },
    });
    fireEvent.change(screen.getByLabelText(/mã số thuế/i), {
      target: { value: '0101234567' },
    });
    fireEvent.change(screen.getByLabelText(/họ và tên/i), {
      target: { value: 'New User' },
    });
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'new@casso.vn' },
    });
    fireEvent.change(screen.getByLabelText(/mật khẩu/i), {
      target: { value: 'secret123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /tạo tài khoản/i }));

    await waitFor(() =>
      expect(screen.getByText(/new\*\*\*@casso\.vn/i)).toBeVisible(),
    );
    expect(apiRequest).toHaveBeenNthCalledWith(1, {
      url: '/api/v1/auth/signup',
      method: 'POST',
      data: {
        organizationName: 'Casso Ledger',
        name: 'New User',
        email: 'new@casso.vn',
        password: 'secret123',
        taxCode: '0101234567',
      },
    });
  });

  it('confirms the OTP inline and lands on onboarding', async () => {
    apiRequest
      .mockResolvedValueOnce({
        userId: 'user-1',
        organizationId: 'org-1',
        organizationStatus: 'ACTIVE',
      })
      .mockResolvedValueOnce({ verified: true, accessToken: 'access-token' })
      .mockResolvedValueOnce({ ...user, bankingLinked: false });

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/signup']}>
          <Routes>
            <Route
              path="/signup"
              element={
                <GuestRoute>
                  <SignupPage />
                </GuestRoute>
              }
            />
            <Route path="/onboarding" element={<div>onboarding</div>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByLabelText(/tên tổ chức/i)).toBeVisible(),
    );
    fireEvent.change(screen.getByLabelText(/tên tổ chức/i), {
      target: { value: 'Casso Ledger' },
    });
    fireEvent.change(screen.getByLabelText(/mã số thuế/i), {
      target: { value: '0101234567' },
    });
    fireEvent.change(screen.getByLabelText(/họ và tên/i), {
      target: { value: 'New User' },
    });
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'new@casso.vn' },
    });
    fireEvent.change(screen.getByLabelText(/mật khẩu/i), {
      target: { value: 'secret123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /tạo tài khoản/i }));

    await waitFor(() =>
      expect(screen.getByText(/new\*\*\*@casso\.vn/i)).toBeVisible(),
    );
    fillOtp('482913');
    fireEvent.click(screen.getByRole('button', { name: /xác nhận/i }));

    await waitFor(() => expect(screen.getByText('onboarding')).toBeVisible());
    expect(apiRequest).toHaveBeenNthCalledWith(2, {
      url: '/api/v1/auth/verify-email',
      method: 'POST',
      data: { email: 'new@casso.vn', otp: '482913' },
    });
  });

  it('shows the OTP fallback screen from a query-param email, with no editable email input', async () => {
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/verify-email?email=new@casso.vn']}>
          <Routes>
            <Route path="/verify-email" element={<VerifyEmailPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByText(/new\*\*\*@casso\.vn/i)).toBeVisible(),
    );
    expect(screen.queryByRole('textbox', { name: /email/i })).toBeNull();
  });

  it('resends the code from the fallback screen', async () => {
    apiRequest.mockResolvedValueOnce({ success: true });

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/verify-email?email=new@casso.vn']}>
          <Routes>
            <Route path="/verify-email" element={<VerifyEmailPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /gửi lại mã/i }),
      ).toBeVisible(),
    );
    fireEvent.click(screen.getByRole('button', { name: /gửi lại mã/i }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith({
        url: '/api/v1/auth/resend-verification',
        method: 'POST',
        data: { email: 'new@casso.vn' },
      }),
    );
  });

  it('shows a pending-review state when the organization is awaiting approval', async () => {
    apiRequest.mockRejectedValueOnce({
      response: {
        data: {
          errorCode: 'ORGANIZATION_PENDING_REVIEW',
          message: 'Tổ chức của bạn đang chờ được duyệt.',
        },
      },
    });

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/verify-email?email=new@casso.vn']}>
          <Routes>
            <Route path="/verify-email" element={<VerifyEmailPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByText(/new\*\*\*@casso\.vn/i)).toBeVisible(),
    );
    fillOtp('482913');
    fireEvent.click(screen.getByRole('button', { name: /xác nhận/i }));

    await waitFor(() =>
      expect(screen.getByText(/email đã được xác minh/i)).toBeVisible(),
    );
    expect(
      screen.getByText(/tổ chức của bạn đang chờ được duyệt/i),
    ).toBeVisible();
  });

  it('shows a rejected state with the API message when the organization was rejected', async () => {
    apiRequest.mockRejectedValueOnce({
      response: {
        data: {
          errorCode: 'ORGANIZATION_REJECTED',
          message: 'Đăng ký tổ chức của bạn chưa được chấp thuận.',
        },
      },
    });

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/verify-email?email=new@casso.vn']}>
          <Routes>
            <Route path="/verify-email" element={<VerifyEmailPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByText(/new\*\*\*@casso\.vn/i)).toBeVisible(),
    );
    fillOtp('482913');
    fireEvent.click(screen.getByRole('button', { name: /xác nhận/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/đăng ký tổ chức của bạn chưa được chấp thuận/i),
      ).toBeVisible(),
    );
  });
});
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `cd apps/frontend && npx vitest run src/features/auth/pages/signup-verify.spec.tsx`
Expected: PASS, all 6 tests.

- [ ] **Step 4: Run the full frontend suite**

Run: `cd apps/frontend && npx vitest run`
Expected: PASS, every suite. Also run `cd apps/frontend && npx tsc --noEmit` (or the repo's `pnpm --filter frontend type-check` script) — PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/auth/pages/signup-verify.spec.tsx apps/frontend/src/features/auth/pages/signup-page.spec.tsx
git commit -m "test: rewrite signup/verify-email frontend coverage for the OTP flow"
```

---

### Task 17: Full verification pass

**Files:** none — this task only runs checks, per AGENTS.md "Verification before completion" and the `domain-check` skill.

- [ ] **Step 1: Backend**

```bash
cd apps/backend
npx tsc --noEmit
npx jest
```
Expected: both PASS, zero errors, zero failing tests.

- [ ] **Step 2: Frontend**

```bash
cd apps/frontend
npx tsc --noEmit
npx vitest run
```
Expected: both PASS.

- [ ] **Step 3: Lint/format**

```bash
npx biome check --write .
```
(run from the repo root) — expected: no unresolved issues after auto-fix.

- [ ] **Step 4: `pnpm verify`**

```bash
pnpm verify
```
Expected: PASS (lint + type-check + test across the whole monorepo).

- [ ] **Step 5: `/domain-check`**

Run the `domain-check` skill per AGENTS.md and fix anything it flags in the files this plan touched.

- [ ] **Step 6: Manual smoke test (dev server)**

Start `pnpm dev:backend` and the frontend dev server, then walk through: sign up a new account → confirm the OTP step appears inline with a masked-email hint (no editable email input) → enter the emailed code → land on onboarding. Then: log out, try logging back in before verifying a second test account → confirm the `EMAIL_NOT_VERIFIED` redirect to `/verify-email?email=...` works and that page also shows no editable email input.

- [ ] **Step 7: Final commit (if smoke testing surfaced fixes)**

```bash
git add -A
git commit -m "fix: address issues found in manual verification"
```

(Skip this commit if Step 6 found nothing to fix.)
