import { Role } from '../../organizations/domain/membership';
import { GetCustomerUseCase } from './get-customer.usecase';

describe('GetCustomerUseCase', () => {
  it('returns the tenant-scoped customer by id', async () => {
    const customer = {
      id: 'customer-1',
      organizationId: 'org-1',
      name: 'Acme',
      taxCode: '0101234567',
      email: 'acme@example.com',
      phone: '0900000000',
      defaultPaymentTermDays: 30,
      creditLimit: 100_000_000,
      priority: 1,
      customerGroup: 'DEFAULT',
      createdAt: new Date('2026-07-01'),
    };
    const customerRepo = {
      findById: jest.fn().mockResolvedValue(customer),
      findByIdForSalesRep: jest.fn(),
    };
    const tenantContext = {
      getCurrentUser: jest.fn().mockReturnValue({
        userId: 'user-1',
        role: Role.ACCOUNTANT,
      }),
    };
    const useCase = new GetCustomerUseCase(
      customerRepo as any,
      tenantContext as any,
    );

    await expect(useCase.execute('customer-1')).resolves.toEqual(customer);
    expect(customerRepo.findById).toHaveBeenCalledWith('customer-1');
  });
});
