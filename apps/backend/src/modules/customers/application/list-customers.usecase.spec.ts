import { ListCustomersUseCase } from './list-customers.usecase';

function buildCustomer(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'customer-1',
    organizationId: 'org-1',
    name: 'Acme',
    taxCode: '0101234567',
    email: 'acme@example.com',
    phone: '0900000000',
    defaultPaymentTermDays: 30,
    creditLimit: 100_000_000,
    priority: 1,
    createdAt: new Date('2026-07-01'),
    ...overrides,
  };
}

describe('ListCustomersUseCase', () => {
  function buildDeps() {
    const customerRepo = {
      findPage: jest.fn().mockResolvedValue([buildCustomer()]),
      count: jest.fn().mockResolvedValue(1),
    };
    const tenantContext = {
      getOrganizationId: jest.fn().mockReturnValue('org-1'),
    };
    return { customerRepo, tenantContext };
  }

  it('scopes the list to the current organization and paginates', async () => {
    const { customerRepo, tenantContext } = buildDeps();
    const useCase = new ListCustomersUseCase(
      customerRepo as any,
      tenantContext as any,
    );

    const result = await useCase.execute({ page: 1, limit: 20 });

    expect(customerRepo.findPage).toHaveBeenCalledWith(
      'org-1',
      undefined,
      1,
      20,
    );
    expect(customerRepo.count).toHaveBeenCalledWith('org-1', undefined);
    expect(result).toEqual({
      items: [expect.objectContaining({ id: 'customer-1' })],
      total: 1,
      page: 1,
      limit: 20,
    });
  });

  it('passes the search term through to the repository', async () => {
    const { customerRepo, tenantContext } = buildDeps();
    const useCase = new ListCustomersUseCase(
      customerRepo as any,
      tenantContext as any,
    );

    await useCase.execute({ search: 'acme', page: 1, limit: 20 });

    expect(customerRepo.findPage).toHaveBeenCalledWith('org-1', 'acme', 1, 20);
  });
});
