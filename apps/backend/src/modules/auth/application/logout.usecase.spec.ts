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
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
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
});
