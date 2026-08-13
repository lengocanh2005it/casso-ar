import { MarkAllAlertsReadUseCase } from './mark-all-alerts-read.usecase';

describe('MarkAllAlertsReadUseCase', () => {
  it('marks every unread alert for the current user read in one call', async () => {
    const alertRepo = { markAllRead: jest.fn().mockResolvedValue(undefined) };
    const tenantContext = {
      getCurrentUser: jest.fn().mockReturnValue({ userId: 'user-1' }),
    };
    const useCase = new MarkAllAlertsReadUseCase(
      alertRepo as any,
      tenantContext as any,
    );

    await useCase.execute();

    expect(alertRepo.markAllRead).toHaveBeenCalledWith('user-1');
  });
});
