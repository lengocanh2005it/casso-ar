import { ReceivableStatus } from '@casso-ledger/shared-types';
import { Role } from '../../organizations/domain/membership';
import { CreateReceivableUseCase } from './create-receivable.usecase';

describe('CreateReceivableUseCase', () => {
  const tenantContext = {
    getOrganizationId: () => 'org-1',
    getCurrentUser: () => ({
      userId: 'user-1',
      organizationId: 'org-1',
      role: Role.OWNER,
    }),
  };

  it('creates a receivable when the customer belongs to the caller organization', async () => {
    const repo = { save: jest.fn() };
    const customerRepo = {
      findById: jest
        .fn()
        .mockResolvedValue({ id: 'cust-1', organizationId: 'org-1' }),
    };
    const useCase = new CreateReceivableUseCase(
      repo as any,
      customerRepo as any,
      tenantContext as any,
    );

    const receivable = await useCase.execute({
      customerId: 'cust-1',
      invoiceId: null,
      originalAmount: 10_000_000,
      dueDate: new Date('2026-09-01'),
      salesRepresentativeId: null,
    });

    expect(customerRepo.findById).toHaveBeenCalledWith('cust-1');
    expect(receivable.status).toBe(ReceivableStatus.OPEN);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        customerId: 'cust-1',
      }),
      undefined,
    );
  });

  it('rejects creating a receivable against a customer from another organization', async () => {
    const repo = { save: jest.fn() };
    // Tenant-scoped repository: a customer belonging to a different org
    // resolves to null, exactly like a missing customer.
    const customerRepo = { findById: jest.fn().mockResolvedValue(null) };
    const useCase = new CreateReceivableUseCase(
      repo as any,
      customerRepo as any,
      tenantContext as any,
    );

    await expect(
      useCase.execute({
        customerId: 'cust-from-other-org',
        invoiceId: null,
        originalAmount: 10_000_000,
        dueDate: new Date('2026-09-01'),
        salesRepresentativeId: null,
      }),
    ).rejects.toThrow('Customer not found');

    expect(repo.save).not.toHaveBeenCalled();
  });
});
