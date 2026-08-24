import { User } from '../../users/domain/user';
import { EmailVerificationToken } from '../domain/email-verification-token';
import { PendingSignup } from '../domain/pending-signup';
import { hashOtp } from './token-hasher';
import { VerifyEmailUseCase } from './verify-email.usecase';

function buildPendingSignup(
  overrides: Partial<ConstructorParameters<typeof PendingSignup>[0]> = {},
) {
  return new PendingSignup({
    id: 'pending-1',
    email: 'a@b.vn',
    passwordHash: 'hashed',
    name: 'An',
    organizationName: 'Acme Co',
    taxCode: '0101234567',
    taxCodeMatched: true,
    taxCodeLookupName: 'Acme Co',
    otpHash: hashOtp('482913'),
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
    ...overrides,
  });
}

describe('VerifyEmailUseCase — legacy User branch', () => {
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
    const pendingSignupRepo = { findByEmail: jest.fn(), delete: jest.fn() };
    const provisionOrganizationUseCase = { execute: jest.fn() };
    const loginUseCase = {
      executeForUser: jest.fn().mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      }),
    };
    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: object) => Promise<unknown>) => callback({}),
      ),
    };

    const useCase = new VerifyEmailUseCase(
      tokenRepo as any,
      userRepo as any,
      pendingSignupRepo as any,
      provisionOrganizationUseCase as any,
      dataSource as any,
      loginUseCase as any,
    );
    await expect(useCase.execute('a@b.vn', otp)).resolves.toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });

    expect(userRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ emailVerifiedAt: expect.any(Date) }),
      expect.anything(),
    );
    expect(tokenRepo.deleteById).toHaveBeenCalledWith(
      'tok-1',
      expect.anything(),
    );
    expect(loginUseCase.executeForUser).toHaveBeenCalledWith('user-1');
    expect(pendingSignupRepo.findByEmail).not.toHaveBeenCalled();
  });
});

describe('VerifyEmailUseCase — PendingSignup branch', () => {
  it('provisions the organization from a PendingSignup and deletes it when there is no legacy match', async () => {
    const otp = '482913';
    const pendingSignup = buildPendingSignup();
    const provisionedUser = new User({
      id: 'user-1',
      name: 'An',
      email: 'a@b.vn',
      passwordHash: 'hashed',
      emailVerifiedAt: null,
      createdAt: new Date(),
    });
    const pendingSignupRepo = {
      findByEmail: jest.fn().mockResolvedValue(pendingSignup),
      delete: jest.fn(),
    };
    const provisionOrganizationUseCase = {
      execute: jest.fn().mockResolvedValue({
        user: provisionedUser,
        organization: { id: 'org-1' },
        membership: { id: 'membership-1' },
      }),
    };
    const userRepo = {
      findByEmail: jest.fn().mockResolvedValue(null),
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
        async (callback: (manager: object) => Promise<unknown>) => callback({}),
      ),
    };
    const useCase = new VerifyEmailUseCase(
      { findByUserIdAndTokenHash: jest.fn() } as any,
      userRepo as any,
      pendingSignupRepo as any,
      provisionOrganizationUseCase as any,
      dataSource as any,
      loginUseCase as any,
    );

    await expect(useCase.execute('a@b.vn', otp)).resolves.toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });

    expect(provisionOrganizationUseCase.execute).toHaveBeenCalledWith(
      {
        name: 'An',
        email: 'a@b.vn',
        passwordHash: 'hashed',
        organizationName: 'Acme Co',
        taxCode: '0101234567',
        taxCodeMatched: true,
        taxCodeLookupName: 'Acme Co',
      },
      expect.anything(),
    );
    // Regression: the freshly-provisioned user must be marked verified before
    // login, or LoginUseCase.executeForUser rejects with FORBIDDEN because
    // ProvisionOrganizationUseCase always creates the user with
    // emailVerifiedAt: null (it doesn't know it's being called post-OTP-check).
    expect(userRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'user-1',
        emailVerifiedAt: expect.any(Date),
      }),
      expect.anything(),
    );
    expect(pendingSignupRepo.delete).toHaveBeenCalledWith(
      'pending-1',
      expect.anything(),
    );
    expect(loginUseCase.executeForUser).toHaveBeenCalledWith('user-1');
  });

  it('throws the generic error for a wrong PendingSignup OTP', async () => {
    const pendingSignup = buildPendingSignup({ otpHash: hashOtp('111111') });
    const pendingSignupRepo = {
      findByEmail: jest.fn().mockResolvedValue(pendingSignup),
      delete: jest.fn(),
    };
    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: object) => Promise<unknown>) => callback({}),
      ),
    };
    const useCase = new VerifyEmailUseCase(
      { findByUserIdAndTokenHash: jest.fn() } as any,
      { findByEmail: jest.fn().mockResolvedValue(null) } as any,
      pendingSignupRepo as any,
      { execute: jest.fn() } as any,
      dataSource as any,
      {} as any,
    );

    await expect(useCase.execute('a@b.vn', '999999')).rejects.toMatchObject({
      errorCode: 'UNAUTHORIZED',
    });
    expect(pendingSignupRepo.delete).not.toHaveBeenCalled();
  });

  it('throws the generic error for an expired PendingSignup', async () => {
    const pendingSignup = buildPendingSignup({
      expiresAt: new Date(Date.now() - 60_000),
    });
    const pendingSignupRepo = {
      findByEmail: jest.fn().mockResolvedValue(pendingSignup),
      delete: jest.fn(),
    };
    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: object) => Promise<unknown>) => callback({}),
      ),
    };
    const useCase = new VerifyEmailUseCase(
      { findByUserIdAndTokenHash: jest.fn() } as any,
      { findByEmail: jest.fn().mockResolvedValue(null) } as any,
      pendingSignupRepo as any,
      { execute: jest.fn() } as any,
      dataSource as any,
      {} as any,
    );

    await expect(useCase.execute('a@b.vn', '482913')).rejects.toMatchObject({
      errorCode: 'UNAUTHORIZED',
    });
  });

  it('throws the generic error when neither a legacy token nor a PendingSignup exists (also covers OTP replay)', async () => {
    const pendingSignupRepo = {
      findByEmail: jest.fn().mockResolvedValue(null),
      delete: jest.fn(),
    };
    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: object) => Promise<unknown>) => callback({}),
      ),
    };
    const useCase = new VerifyEmailUseCase(
      { findByUserIdAndTokenHash: jest.fn() } as any,
      { findByEmail: jest.fn().mockResolvedValue(null) } as any,
      pendingSignupRepo as any,
      { execute: jest.fn() } as any,
      dataSource as any,
      {} as any,
    );

    await expect(
      useCase.execute('missing@b.vn', '123456'),
    ).rejects.toMatchObject({ errorCode: 'UNAUTHORIZED' });
  });
});
