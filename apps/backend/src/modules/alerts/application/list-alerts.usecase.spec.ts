import { ErrorCode } from '../../../common/errors/error-code';
import { ListAlertsUseCase } from './list-alerts.usecase';

describe('ListAlertsUseCase', () => {
  it('delegates to the repository with the current user id', async () => {
    const alertRepo = {
      findPage: jest
        .fn()
        .mockResolvedValue({ items: [], total: 0, unreadCount: 0 }),
    };
    const tenantContext = {
      getCurrentUser: jest.fn().mockReturnValue({ userId: 'user-1' }),
    };
    const useCase = new ListAlertsUseCase(
      alertRepo as any,
      tenantContext as any,
    );

    await useCase.execute(2, 10, true);

    expect(alertRepo.findPage).toHaveBeenCalledWith('user-1', 2, 10, true);
  });

  it('throws UNAUTHORIZED when there is no authenticated user', async () => {
    const alertRepo = { findPage: jest.fn() };
    const tenantContext = {
      getCurrentUser: jest.fn().mockReturnValue(undefined),
    };
    const useCase = new ListAlertsUseCase(
      alertRepo as any,
      tenantContext as any,
    );

    await expect(useCase.execute(1, 20, false)).rejects.toMatchObject({
      errorCode: ErrorCode.UNAUTHORIZED,
    });
  });
});
