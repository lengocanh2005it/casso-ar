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
  const manager = {};
  const dataSource = {
    transaction: jest.fn((fn: (manager: unknown) => unknown) => fn(manager)),
  };

  it('creates a receivable when the customer belongs to the caller organization', async () => {
    const repo = { save: jest.fn() };
    const customerRepo = {
      findById: jest
        .fn()
        .mockResolvedValue({ id: 'cust-1', organizationId: 'org-1' }),
    };
    const planLimit = { enforceReceivableLimit: jest.fn() };
    const useCase = new CreateReceivableUseCase(
      repo as any,
      customerRepo as any,
      tenantContext as any,
      planLimit as any,
      dataSource as any,
    );

    const receivable = await useCase.execute({
      customerId: 'cust-1',
      invoiceId: null,
      originalAmount: 10_000_000,
      dueDate: new Date('2026-09-01'),
      salesRepresentativeId: null,
    });

    expect(customerRepo.findById).toHaveBeenCalledWith('cust-1');
    expect(planLimit.enforceReceivableLimit).toHaveBeenCalledWith(manager);
    expect(receivable.status).toBe(ReceivableStatus.OPEN);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        customerId: 'cust-1',
      }),
      manager,
    );
  });

  it('rejects creating a receivable against a customer from another organization', async () => {
    const repo = { save: jest.fn() };
    // Tenant-scoped repository: a customer belonging to a different org
    // resolves to null, exactly like a missing customer.
    const customerRepo = { findById: jest.fn().mockResolvedValue(null) };
    const planLimit = { enforceReceivableLimit: jest.fn() };
    const useCase = new CreateReceivableUseCase(
      repo as any,
      customerRepo as any,
      tenantContext as any,
      planLimit as any,
      dataSource as any,
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

  it('rejects creating a receivable when the plan limit has been reached', async () => {
    const repo = { save: jest.fn() };
    const customerRepo = {
      findById: jest
        .fn()
        .mockResolvedValue({ id: 'cust-1', organizationId: 'org-1' }),
    };
    const planLimit = {
      enforceReceivableLimit: jest
        .fn()
        .mockRejectedValue(new Error('PLAN_LIMIT_EXCEEDED')),
    };
    const useCase = new CreateReceivableUseCase(
      repo as any,
      customerRepo as any,
      tenantContext as any,
      planLimit as any,
      dataSource as any,
    );

    await expect(
      useCase.execute({
        customerId: 'cust-1',
        invoiceId: null,
        originalAmount: 10_000_000,
        dueDate: new Date('2026-09-01'),
        salesRepresentativeId: null,
      }),
    ).rejects.toThrow('PLAN_LIMIT_EXCEEDED');

    expect(repo.save).not.toHaveBeenCalled();
  });
});
