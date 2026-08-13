import { DeleteAllAlertsUseCase } from './delete-all-alerts.usecase';

describe('DeleteAllAlertsUseCase', () => {
  it('deletes every alert for the current user in one call', async () => {
    const alertRepo = { deleteAll: jest.fn().mockResolvedValue(undefined) };
    const tenantContext = {
      getCurrentUser: jest.fn().mockReturnValue({ userId: 'user-1' }),
    };
    const useCase = new DeleteAllAlertsUseCase(
      alertRepo as any,
      tenantContext as any,
    );

    await useCase.execute();

    expect(alertRepo.deleteAll).toHaveBeenCalledWith('user-1');
  });
});
