import { Membership, Role } from '../../organizations/domain/membership';
import { RefreshToken } from '../domain/refresh-token';
import { RefreshAccessTokenUseCase } from './refresh-access-token.usecase';
import { hashToken } from './token-hasher';

describe('RefreshAccessTokenUseCase', () => {
  it('rotates a valid refresh token and revokes the old token', async () => {
    const raw = 'r'.repeat(64);
    const existing = new RefreshToken({
      id: 'refresh-1',
      userId: 'user-1',
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      createdAt: new Date(),
    });
    const refreshTokenRepo = {
      findByTokenHash: jest.fn().mockResolvedValue(existing),
      save: jest.fn(),
    };
    const membershipRepo = {
      findFirstActiveByUserId: jest.fn().mockResolvedValue(
        new Membership({
          id: 'membership-1',
          userId: 'user-1',
          organizationId: 'org-1',
          role: Role.OWNER,
          invitedAt: new Date(),
          joinedAt: new Date(),
          createdAt: new Date(),
        }),
      ),
    };
    const jwtService = { sign: jest.fn().mockReturnValue('access') };
    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: object) => Promise<unknown>) => callback({}),
      ),
    };
    const useCase = new RefreshAccessTokenUseCase(
      refreshTokenRepo as any,
      membershipRepo as any,
      jwtService as any,
      dataSource as any,
    );

    const result = await useCase.execute(raw);

    expect(result.accessToken).toBe('access');
    expect(result.refreshToken).toHaveLength(64);
    expect(refreshTokenRepo.findByTokenHash).toHaveBeenCalledWith(
      hashToken(raw),
      expect.anything(),
      true,
    );
    expect(refreshTokenRepo.save).toHaveBeenCalledTimes(2);
    expect(refreshTokenRepo.save.mock.calls[0][0].revokedAt).toBeInstanceOf(
      Date,
    );
  });

  it('revokes the whole token family when a revoked token is reused (theft detection)', async () => {
    const raw = 'r'.repeat(64);
    const existing = new RefreshToken({
      id: 'refresh-1',
      userId: 'user-1',
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date(Date.now() - 1_000),
      createdAt: new Date(),
    });
    const refreshTokenRepo = {
      findByTokenHash: jest.fn().mockResolvedValue(existing),
      save: jest.fn(),
      revokeAllForUser: jest.fn(),
    };
    const membershipRepo = { findFirstActiveByUserId: jest.fn() };
    const jwtService = { sign: jest.fn() };
    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: object) => Promise<unknown>) => callback({}),
      ),
    };
    const useCase = new RefreshAccessTokenUseCase(
      refreshTokenRepo as any,
      membershipRepo as any,
      jwtService as any,
      dataSource as any,
    );

    await expect(useCase.execute(raw)).rejects.toThrow(
      'Refresh token không hợp lệ hoặc đã hết hạn.',
    );

    expect(refreshTokenRepo.revokeAllForUser).toHaveBeenCalledWith(
      'user-1',
      expect.anything(),
    );
    expect(membershipRepo.findFirstActiveByUserId).not.toHaveBeenCalled();
  });

  it('does not revoke the family when an expired (never revoked) token is reused', async () => {
    const raw = 'r'.repeat(64);
    const existing = new RefreshToken({
      id: 'refresh-1',
      userId: 'user-1',
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() - 1_000),
      revokedAt: null,
      createdAt: new Date(),
    });
    const refreshTokenRepo = {
      findByTokenHash: jest.fn().mockResolvedValue(existing),
      save: jest.fn(),
      revokeAllForUser: jest.fn(),
    };
    const membershipRepo = { findFirstActiveByUserId: jest.fn() };
    const jwtService = { sign: jest.fn() };
    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: object) => Promise<unknown>) => callback({}),
      ),
    };
    const useCase = new RefreshAccessTokenUseCase(
      refreshTokenRepo as any,
      membershipRepo as any,
      jwtService as any,
      dataSource as any,
    );

    await expect(useCase.execute(raw)).rejects.toThrow(
      'Refresh token không hợp lệ hoặc đã hết hạn.',
    );

    expect(refreshTokenRepo.revokeAllForUser).not.toHaveBeenCalled();
  });
});
