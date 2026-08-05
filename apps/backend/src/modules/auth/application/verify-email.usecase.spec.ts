import { User } from '../../users/domain/user';
import { EmailVerificationToken } from '../domain/email-verification-token';
import { hashToken } from './token-hasher';
import { VerifyEmailUseCase } from './verify-email.usecase';

describe('VerifyEmailUseCase', () => {
  it('marks the user verified and deletes the token in one transaction', async () => {
    const rawToken = 'a'.repeat(64);
    const token = new EmailVerificationToken({
      id: 'tok-1',
      userId: 'user-1',
      tokenHash: hashToken(rawToken),
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
      findByTokenHash: jest.fn().mockResolvedValue(token),
      deleteById: jest.fn(),
    };
    const userRepo = {
      findById: jest.fn().mockResolvedValue(user),
      save: jest.fn(),
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
    );
    await useCase.execute(rawToken);

    expect(userRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ emailVerifiedAt: expect.any(Date) }),
      expect.anything(),
    );
    expect(tokenRepo.deleteById).toHaveBeenCalledWith(
      'tok-1',
      expect.anything(),
    );
  });

  it('throws when the token is expired', async () => {
    const rawToken = 'b'.repeat(64);
    const token = new EmailVerificationToken({
      id: 'tok-2',
      userId: 'user-1',
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() - 60_000),
      createdAt: new Date(),
    });
    const useCase = new VerifyEmailUseCase(
      { findByTokenHash: jest.fn().mockResolvedValue(token) } as any,
      {} as any,
      {} as any,
    );

    await expect(useCase.execute(rawToken)).rejects.toThrow(
      'Verification token expired or invalid',
    );
  });
});
