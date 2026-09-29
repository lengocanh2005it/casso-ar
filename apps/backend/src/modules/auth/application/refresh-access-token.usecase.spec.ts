import { Membership, Role } from '../../organizations/domain/membership';
import { User } from '../../users/domain/user';
import { RefreshToken } from '../domain/refresh-token';
import { RefreshAccessTokenUseCase } from './refresh-access-token.usecase';
import { hashToken } from './token-hasher';

describe('RefreshAccessTokenUseCase', () => {
  it('rotates a valid refresh token and revokes the old token', async () => {
    const raw = 'r'.repeat(64);
    const existing = new RefreshToken({
      id: 'refresh-1',
      userId: 'user-1',
      sessionId: null,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      replacedByTokenId: null,
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
    const userRepo = {
      findById: jest.fn().mockResolvedValue(
        new User({
          id: 'user-1',
          name: 'An',
          email: 'ap@congtyb.vn',
          passwordHash: 'hash',
          emailVerifiedAt: new Date(),
          isOperator: false,
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
      userRepo as any,
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
      sessionId: null,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date(Date.now() - 1_000),
      replacedByTokenId: null,
      createdAt: new Date(),
    });
    const refreshTokenRepo = {
      findByTokenHash: jest.fn().mockResolvedValue(existing),
      save: jest.fn(),
      revokeAllForUser: jest.fn(),
    };
    const membershipRepo = { findFirstActiveByUserId: jest.fn() };
    const userRepo = { findById: jest.fn() };
    const jwtService = { sign: jest.fn() };
    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: object) => Promise<unknown>) => callback({}),
      ),
    };
    const useCase = new RefreshAccessTokenUseCase(
      refreshTokenRepo as any,
      membershipRepo as any,
      userRepo as any,
      jwtService as any,
      dataSource as any,
    );

    await expect(useCase.execute(raw)).rejects.toThrow(
      'Refresh token không hợp lệ hoặc đã hết hạn.',
    );

    // Family revocation must run OUTSIDE the rotation transaction so the
    // UNAUTHORIZED throw cannot roll it back.
    expect(refreshTokenRepo.revokeAllForUser).toHaveBeenCalledWith('user-1');
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(membershipRepo.findFirstActiveByUserId).not.toHaveBeenCalled();
  });

  it('does not revoke the family when an expired (never revoked) token is reused', async () => {
    const raw = 'r'.repeat(64);
    const existing = new RefreshToken({
      id: 'refresh-1',
      userId: 'user-1',
      sessionId: null,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() - 1_000),
      revokedAt: null,
      replacedByTokenId: null,
      createdAt: new Date(),
    });
    const refreshTokenRepo = {
      findByTokenHash: jest.fn().mockResolvedValue(existing),
      save: jest.fn(),
      revokeAllForUser: jest.fn(),
    };
    const membershipRepo = { findFirstActiveByUserId: jest.fn() };
    const userRepo = { findById: jest.fn() };
    const jwtService = { sign: jest.fn() };
    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: object) => Promise<unknown>) => callback({}),
      ),
    };
    const useCase = new RefreshAccessTokenUseCase(
      refreshTokenRepo as any,
      membershipRepo as any,
      userRepo as any,
      jwtService as any,
      dataSource as any,
    );

    await expect(useCase.execute(raw)).rejects.toThrow(
      'Refresh token không hợp lệ hoặc đã hết hạn.',
    );

    expect(refreshTokenRepo.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('refreshes an operator-only session (no membership) instead of forcing logout', async () => {
    const raw = 'r'.repeat(64);
    const existing = new RefreshToken({
      id: 'refresh-1',
      userId: 'operator-1',
      sessionId: null,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      replacedByTokenId: null,
      createdAt: new Date(),
    });
    const refreshTokenRepo = {
      findByTokenHash: jest.fn().mockResolvedValue(existing),
      save: jest.fn(),
    };
    const membershipRepo = {
      findFirstActiveByUserId: jest.fn().mockResolvedValue(null),
    };
    const userRepo = {
      findById: jest.fn().mockResolvedValue(
        new User({
          id: 'operator-1',
          name: 'Operator',
          email: 'operator@casso.vn',
          passwordHash: 'hash',
          emailVerifiedAt: new Date(),
          isOperator: true,
          createdAt: new Date(),
        }),
      ),
    };
    const tokenSigner = { sign: jest.fn().mockReturnValue('access') };
    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: object) => Promise<unknown>) => callback({}),
      ),
    };
    const useCase = new RefreshAccessTokenUseCase(
      refreshTokenRepo as any,
      membershipRepo as any,
      userRepo as any,
      tokenSigner as any,
      dataSource as any,
    );

    const result = await useCase.execute(raw);

    expect(result.accessToken).toBe('access');
    expect(tokenSigner.sign).toHaveBeenCalledWith({
      userId: 'operator-1',
      isOperator: true,
    });
  });
});

describe('RefreshAccessTokenUseCase grace window and sessions', () => {
  const raw = 'g'.repeat(64);
  const now = Date.now();

  function makeToken(
    overrides: Partial<ConstructorParameters<typeof RefreshToken>[0]>,
  ) {
    return new RefreshToken({
      id: 'token-1',
      userId: 'user-1',
      sessionId: 'session-1',
      tokenHash: hashToken(raw),
      expiresAt: new Date(now + 60_000),
      revokedAt: null,
      replacedByTokenId: null,
      createdAt: new Date(now - 3_600_000),
      ...overrides,
    });
  }

  function makeUseCase(options: {
    probe: RefreshToken | null;
    locked?: RefreshToken | null;
    successor?: RefreshToken | null;
  }) {
    const refreshTokenRepo = {
      findByTokenHash: jest
        .fn()
        .mockResolvedValueOnce(options.probe)
        .mockResolvedValue(
          options.locked === undefined ? options.probe : options.locked,
        ),
      findById: jest.fn().mockResolvedValue(options.successor ?? null),
      save: jest.fn(),
      revokeAllForUser: jest.fn(),
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
    const userRepo = {
      findById: jest.fn().mockResolvedValue(
        new User({
          id: 'user-1',
          name: 'An',
          email: 'ap@congtyb.vn',
          passwordHash: 'hash',
          emailVerifiedAt: new Date(),
          isOperator: false,
          createdAt: new Date(),
        }),
      ),
    };
    const jwtService = { sign: jest.fn().mockReturnValue('access') };
    const manager = {};
    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: object) => Promise<unknown>) =>
          callback(manager),
      ),
    };
    const logger = { warn: jest.fn() };
    const useCase = new RefreshAccessTokenUseCase(
      refreshTokenRepo as any,
      membershipRepo as any,
      userRepo as any,
      jwtService as any,
      dataSource as any,
      logger as any,
    );
    return { useCase, refreshTokenRepo, dataSource, logger, manager };
  }

  const rotatedToken = () =>
    makeToken({
      revokedAt: new Date(now - 2_000),
      replacedByTokenId: 'token-2',
    });
  const liveSuccessor = (overrides = {}) =>
    makeToken({
      id: 'token-2',
      tokenHash: 'hash-2',
      createdAt: new Date(now - 2_000),
      ...overrides,
    });

  it('rotation links the successor and carries the session forward', async () => {
    const { useCase, refreshTokenRepo } = makeUseCase({ probe: makeToken({}) });

    await useCase.execute(raw);

    const [rotated, created] = refreshTokenRepo.save.mock.calls.map(
      ([token]) => token as RefreshToken,
    );
    expect(rotated.replacedByTokenId).toBe(created.id);
    expect(created.sessionId).toBe('session-1');
  });

  it('issues a fresh token inside the window without revoking anything', async () => {
    const { useCase, refreshTokenRepo, logger } = makeUseCase({
      probe: rotatedToken(),
      successor: liveSuccessor(),
    });

    const result = await useCase.execute(raw);

    expect(result.accessToken).toBe('access');
    expect(refreshTokenRepo.revokeAllForUser).not.toHaveBeenCalled();
    expect(refreshTokenRepo.save).toHaveBeenCalledTimes(1);
    const created = refreshTokenRepo.save.mock.calls[0][0] as RefreshToken;
    expect(created.revokedAt).toBeNull();
    expect(created.sessionId).toBe('session-1');
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1' }),
    );
  });

  it('reads the successor under a share lock inside the transaction', async () => {
    const { useCase, refreshTokenRepo, manager } = makeUseCase({
      probe: rotatedToken(),
      successor: liveSuccessor(),
    });

    await useCase.execute(raw);

    expect(refreshTokenRepo.findById).toHaveBeenLastCalledWith(
      'token-2',
      manager,
      true,
    );
  });

  it('treats a revoked successor as theft', async () => {
    const { useCase, refreshTokenRepo } = makeUseCase({
      probe: rotatedToken(),
      successor: liveSuccessor({ revokedAt: new Date(now) }),
    });

    await expect(useCase.execute(raw)).rejects.toThrow(
      'Refresh token không hợp lệ hoặc đã hết hạn.',
    );

    expect(refreshTokenRepo.revokeAllForUser).toHaveBeenCalledWith('user-1');
  });

  it('revokes the family when the window closes between the pre-check and the row lock', async () => {
    const { useCase, refreshTokenRepo } = makeUseCase({
      probe: rotatedToken(),
      successor: liveSuccessor(),
      // By the time the lock is taken the successor has aged out.
      locked: rotatedToken(),
    });
    refreshTokenRepo.findById
      .mockResolvedValueOnce(liveSuccessor())
      .mockResolvedValueOnce(
        liveSuccessor({ createdAt: new Date(now - 60_000) }),
      );

    await expect(useCase.execute(raw)).rejects.toThrow(
      'Refresh token không hợp lệ hoặc đã hết hạn.',
    );

    expect(refreshTokenRepo.revokeAllForUser).toHaveBeenCalledWith('user-1');
    expect(refreshTokenRepo.save).not.toHaveBeenCalled();
  });

  it('does not revoke the family for an expired token that was never revoked', async () => {
    const { useCase, refreshTokenRepo } = makeUseCase({
      probe: makeToken({ expiresAt: new Date(now - 1) }),
    });

    await expect(useCase.execute(raw)).rejects.toThrow(
      'Refresh token không hợp lệ hoặc đã hết hạn.',
    );

    expect(refreshTokenRepo.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('does not grant the window to a token that had already expired', async () => {
    const { useCase, refreshTokenRepo } = makeUseCase({
      probe: makeToken({
        expiresAt: new Date(now - 1),
        revokedAt: new Date(now - 2_000),
        replacedByTokenId: 'token-2',
      }),
      successor: liveSuccessor(),
    });

    await expect(useCase.execute(raw)).rejects.toThrow(
      'Refresh token không hợp lệ hoặc đã hết hạn.',
    );

    expect(refreshTokenRepo.revokeAllForUser).toHaveBeenCalledWith('user-1');
  });

  it('starts a session when it rotates a token that predates sessions', async () => {
    const { useCase, refreshTokenRepo } = makeUseCase({
      probe: makeToken({ sessionId: null }),
    });

    await useCase.execute(raw);

    const [rotated, created] = refreshTokenRepo.save.mock.calls.map(
      ([token]) => token as RefreshToken,
    );
    expect(created.sessionId).toEqual(expect.any(String));
    expect(rotated.replacedByTokenId).toBe(created.id);
  });

  it('joins the successor session when a grace replay presents a token that predates sessions', async () => {
    const { useCase, refreshTokenRepo } = makeUseCase({
      probe: makeToken({
        sessionId: null,
        revokedAt: new Date(now - 2_000),
        replacedByTokenId: 'token-2',
      }),
      successor: liveSuccessor({ sessionId: 'session-from-rotation' }),
    });

    await useCase.execute(raw);

    const created = refreshTokenRepo.save.mock.calls[0][0] as RefreshToken;
    expect(created.sessionId).toBe('session-from-rotation');
  });
});
