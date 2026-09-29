import { RefreshToken } from '../domain/refresh-token';
import { LogoutUseCase } from './logout.usecase';
import { hashToken } from './token-hasher';

describe('LogoutUseCase', () => {
  it('returns without error when token is empty', async () => {
    const refreshTokenRepo = {
      findByTokenHash: jest.fn(),
      save: jest.fn(),
    };
    const dataSource = { transaction: jest.fn() };
    const useCase = new LogoutUseCase(
      refreshTokenRepo as any,
      dataSource as any,
    );

    await useCase.execute('');
    await useCase.execute(undefined as any);

    expect(refreshTokenRepo.findByTokenHash).not.toHaveBeenCalled();
  });

  it('returns without error when token not found', async () => {
    const refreshTokenRepo = {
      findByTokenHash: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
    };
    const dataSource = { transaction: jest.fn() };
    const useCase = new LogoutUseCase(
      refreshTokenRepo as any,
      dataSource as any,
    );

    await useCase.execute('nonexistent');

    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('revokes token via transaction when found', async () => {
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
    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: object) => Promise<unknown>) => callback({}),
      ),
    };
    const useCase = new LogoutUseCase(
      refreshTokenRepo as any,
      dataSource as any,
    );

    await useCase.execute(raw);

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(refreshTokenRepo.save).toHaveBeenCalledTimes(1);
    expect(refreshTokenRepo.save.mock.calls[0][0].revokedAt).toBeInstanceOf(
      Date,
    );
  });

  describe('with a session', () => {
    const raw = 's'.repeat(64);
    const tokenOf = (
      overrides: Partial<ConstructorParameters<typeof RefreshToken>[0]>,
    ) =>
      new RefreshToken({
        id: 'refresh-2',
        userId: 'user-1',
        sessionId: 'session-1',
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        replacedByTokenId: null,
        createdAt: new Date(),
        ...overrides,
      });

    function makeUseCase(existing: RefreshToken) {
      const manager = {};
      const refreshTokenRepo = {
        findByTokenHash: jest.fn().mockResolvedValue(existing),
        save: jest.fn(),
        revokeSession: jest.fn(),
      };
      const dataSource = {
        transaction: jest.fn(
          async (callback: (manager: object) => Promise<unknown>) =>
            callback(manager),
        ),
      };
      const useCase = new LogoutUseCase(
        refreshTokenRepo as any,
        dataSource as any,
      );
      return { useCase, refreshTokenRepo, manager };
    }

    it('ends every token of the session, including grace siblings', async () => {
      const { useCase, refreshTokenRepo, manager } = makeUseCase(tokenOf({}));

      await useCase.execute(raw);

      expect(refreshTokenRepo.revokeSession).toHaveBeenCalledWith(
        'session-1',
        manager,
      );
    });

    it('does not end other sessions of the same user', async () => {
      const { useCase, refreshTokenRepo } = makeUseCase(tokenOf({}));

      await useCase.execute(raw);

      expect(refreshTokenRepo.revokeSession).toHaveBeenCalledTimes(1);
      expect(refreshTokenRepo.revokeSession).not.toHaveBeenCalledWith(
        'session-2',
        expect.anything(),
      );
    });

    it('revokes only the presented token when it has no session', async () => {
      const { useCase, refreshTokenRepo } = makeUseCase(
        tokenOf({ sessionId: null }),
      );

      await useCase.execute(raw);

      expect(refreshTokenRepo.revokeSession).not.toHaveBeenCalled();
      expect(refreshTokenRepo.save).toHaveBeenCalledTimes(1);
    });
  });
});
