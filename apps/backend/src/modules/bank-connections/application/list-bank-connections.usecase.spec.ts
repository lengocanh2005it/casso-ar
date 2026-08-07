import { ListBankConnectionsUseCase } from './list-bank-connections.usecase';

describe('ListBankConnectionsUseCase', () => {
  function buildDeps() {
    const bankConnectionRepo = {
      findPage: jest.fn().mockResolvedValue([{ id: 'conn-1' }]),
      count: jest.fn().mockResolvedValue(1),
    };
    const tenantContext = {
      getOrganizationId: jest.fn().mockReturnValue('org-1'),
    };
    return { bankConnectionRepo, tenantContext };
  }

  it('scopes the list to the current organization and paginates', async () => {
    const { bankConnectionRepo, tenantContext } = buildDeps();
    const useCase = new ListBankConnectionsUseCase(
      bankConnectionRepo as any,
      tenantContext as any,
    );

    const result = await useCase.execute(1, 20);

    expect(bankConnectionRepo.findPage).toHaveBeenCalledWith('org-1', 1, 20);
    expect(bankConnectionRepo.count).toHaveBeenCalledWith('org-1');
    expect(result).toEqual({
      items: [{ id: 'conn-1' }],
      total: 1,
      page: 1,
      limit: 20,
    });
  });
});
