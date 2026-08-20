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
