import { ReceivableStatus } from '@casso-ledger/shared-types';
import { ErrorCode } from '../../../common/errors/error-code';
import { Role } from '../../organizations/domain/membership';
import { BalanceHistoryActorType } from '../../receivable-balance-history/domain/balance-history-actor-type';
import { BalanceHistoryChangeSource } from '../../receivable-balance-history/domain/balance-history-change-source';
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
    const recorder = { record: jest.fn() };
    const useCase = new CreateReceivableUseCase(
      repo as any,
      customerRepo as any,
      tenantContext as any,
      planLimit as any,
      dataSource as any,
      recorder as any,
    );

    const receivable = await useCase.execute({
      customerId: 'cust-1',
      invoiceId: null,
      originalAmount: 10_000_000,
      dueDate: new Date('2026-09-01'),
      salesRepresentativeId: null,
    });

    expect(customerRepo.findById).toHaveBeenCalledWith('cust-1', manager);
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

  it('records the created receivable balance history', async () => {
    const repo = { save: jest.fn() };
    const customerRepo = {
      findById: jest
        .fn()
        .mockResolvedValue({ id: 'cust-1', organizationId: 'org-1' }),
    };
    const planLimit = { enforceReceivableLimit: jest.fn() };
    const recorder = { record: jest.fn() };
    const useCase = new CreateReceivableUseCase(
      repo as any,
      customerRepo as any,
      tenantContext as any,
      planLimit as any,
      dataSource as any,
      recorder as any,
    );

    await useCase.execute({
      customerId: 'cust-1',
      invoiceId: null,
      originalAmount: 10_000_000,
      dueDate: new Date('2026-09-01'),
      salesRepresentativeId: null,
    });

    expect(recorder.record).toHaveBeenCalledWith({
      receivable: expect.objectContaining({
        organizationId: 'org-1',
        status: ReceivableStatus.OPEN,
        paidAmount: 0,
      }),
      changeSource: BalanceHistoryChangeSource.CREATE,
      provenance: {
        actorType: BalanceHistoryActorType.USER,
        actorUserId: 'user-1',
      },
      manager,
    });
  });

  it('rejects creating a receivable against a customer from another organization', async () => {
    const repo = { save: jest.fn() };
    // Tenant-scoped repository: a customer belonging to a different org
    // resolves to null, exactly like a missing customer.
    const customerRepo = { findById: jest.fn().mockResolvedValue(null) };
    const planLimit = { enforceReceivableLimit: jest.fn() };
    const recorder = { record: jest.fn() };
    const useCase = new CreateReceivableUseCase(
      repo as any,
      customerRepo as any,
      tenantContext as any,
      planLimit as any,
      dataSource as any,
      recorder as any,
    );

    await expect(
      useCase.execute({
        customerId: 'cust-from-other-org',
        invoiceId: null,
        originalAmount: 10_000_000,
        dueDate: new Date('2026-09-01'),
        salesRepresentativeId: null,
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.NOT_FOUND });

    expect(repo.save).not.toHaveBeenCalled();
    expect(recorder.record).not.toHaveBeenCalled();
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
    const recorder = { record: jest.fn() };
    const useCase = new CreateReceivableUseCase(
      repo as any,
      customerRepo as any,
      tenantContext as any,
      planLimit as any,
      dataSource as any,
      recorder as any,
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
    expect(recorder.record).not.toHaveBeenCalled();
  });

  it('uses an existing transaction manager instead of opening a nested transaction', async () => {
    const input = {
      customerId: 'cust-1',
      invoiceId: null,
      originalAmount: 10_000_000,
      dueDate: new Date('2026-09-01'),
      salesRepresentativeId: null,
    };
    const suppliedManager = { name: 'supplied-manager' };
    const transactionManager = { name: 'transaction-manager' };

    const transactionalRepo = { save: jest.fn() };
    const transactionalCustomerRepo = {
      findById: jest
        .fn()
        .mockResolvedValue({ id: 'cust-1', organizationId: 'org-1' }),
    };
    const transactionalPlanLimit = { enforceReceivableLimit: jest.fn() };
    const transactionalRecorder = { record: jest.fn() };
    const transactionalDataSource = {
      transaction: jest.fn((fn: (manager: unknown) => unknown) =>
        fn(transactionManager),
      ),
    };
    await new CreateReceivableUseCase(
      transactionalRepo as any,
      transactionalCustomerRepo as any,
      tenantContext as any,
      transactionalPlanLimit as any,
      transactionalDataSource as any,
      transactionalRecorder as any,
    ).execute(input);

    expect(transactionalDataSource.transaction).toHaveBeenCalledTimes(1);
    expect(transactionalCustomerRepo.findById).toHaveBeenCalledWith(
      'cust-1',
      transactionManager,
    );
    expect(transactionalPlanLimit.enforceReceivableLimit).toHaveBeenCalledWith(
      transactionManager,
    );
    expect(transactionalRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'cust-1' }),
      transactionManager,
    );
    expect(transactionalRecorder.record).toHaveBeenCalledWith({
      receivable: expect.objectContaining({ customerId: 'cust-1' }),
      changeSource: BalanceHistoryChangeSource.CREATE,
      provenance: {
        actorType: BalanceHistoryActorType.USER,
        actorUserId: 'user-1',
      },
      manager: transactionManager,
    });

    const suppliedRepo = { save: jest.fn() };
    const suppliedCustomerRepo = {
      findById: jest
        .fn()
        .mockResolvedValue({ id: 'cust-1', organizationId: 'org-1' }),
    };
    const suppliedPlanLimit = { enforceReceivableLimit: jest.fn() };
    const suppliedRecorder = { record: jest.fn() };
    const suppliedDataSource = {
      transaction: jest.fn(),
    };
    await new CreateReceivableUseCase(
      suppliedRepo as any,
      suppliedCustomerRepo as any,
      tenantContext as any,
      suppliedPlanLimit as any,
      suppliedDataSource as any,
      suppliedRecorder as any,
    ).execute(input, suppliedManager as any);

    expect(suppliedDataSource.transaction).not.toHaveBeenCalled();
    expect(suppliedCustomerRepo.findById).toHaveBeenCalledWith(
      'cust-1',
      suppliedManager,
    );
    expect(suppliedPlanLimit.enforceReceivableLimit).toHaveBeenCalledWith(
      suppliedManager,
    );
    expect(suppliedRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'cust-1' }),
      suppliedManager,
    );
    expect(suppliedRecorder.record).toHaveBeenCalledWith({
      receivable: expect.objectContaining({ customerId: 'cust-1' }),
      changeSource: BalanceHistoryChangeSource.CREATE,
      provenance: {
        actorType: BalanceHistoryActorType.USER,
        actorUserId: 'user-1',
      },
      manager: suppliedManager,
    });
  });
});
