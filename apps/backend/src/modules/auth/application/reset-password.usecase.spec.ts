import { PasswordResetToken } from '../domain/password-reset-token';
import { ResetPasswordUseCase } from './reset-password.usecase';
import { hashToken } from './token-hasher';

describe('ResetPasswordUseCase', () => {
  it('sets a new password hash and revokes all refresh tokens atomically', async () => {
    const rawToken = 'e'.repeat(64);
    const resetToken = new PasswordResetToken({
      id: 'rt-1',
      userId: 'user-1',
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
      createdAt: new Date(),
    });
    const resetTokenRepo = {
      findByTokenHash: jest.fn().mockResolvedValue(resetToken),
      save: jest.fn(),
    };
    const userRepo = {
      findById: jest.fn().mockResolvedValue({
        id: 'user-1',
        withPasswordHash: (passwordHash: string) => ({
          id: 'user-1',
          passwordHash,
        }),
      }),
      save: jest.fn(),
    };
    const refreshTokenRepo = { revokeAllForUser: jest.fn() };
    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: object) => Promise<unknown>) => callback({}),
      ),
    };
    const useCase = new ResetPasswordUseCase(
      resetTokenRepo as any,
      userRepo as any,
      refreshTokenRepo as any,
      dataSource as any,
    );

    await useCase.execute({ token: rawToken, newPassword: 'BrandNewPass1!' });

    expect(userRepo.save).toHaveBeenCalled();
    expect(refreshTokenRepo.revokeAllForUser).toHaveBeenCalledWith(
      'user-1',
      expect.anything(),
    );
    expect(resetTokenRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ usedAt: expect.any(Date) }),
      expect.anything(),
    );
  });

  it('throws when the token was already used', async () => {
    const rawToken = 'f'.repeat(64);
    const resetToken = new PasswordResetToken({
      id: 'rt-2',
      userId: 'user-1',
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: new Date(),
      createdAt: new Date(),
    });
    const useCase = new ResetPasswordUseCase(
      { findByTokenHash: jest.fn().mockResolvedValue(resetToken) } as any,
      {} as any,
      {} as any,
      {
        transaction: jest.fn(
          async (callback: (manager: object) => Promise<unknown>) =>
            callback({}),
        ),
      } as any,
    );

    await expect(
      useCase.execute({ token: rawToken, newPassword: 'x' }),
    ).rejects.toThrow('Reset token expired or already used');
  });
});
