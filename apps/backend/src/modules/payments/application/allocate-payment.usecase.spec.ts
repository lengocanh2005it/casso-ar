import { ReceivableStatus } from '@casso-ledger/shared-types';
import type { EntityManager } from 'typeorm';
import { ErrorCode } from '../../../common/errors/error-code';
import { BalanceHistoryActorType } from '../../receivable-balance-history/domain/balance-history-actor-type';
import { BalanceHistoryChangeSource } from '../../receivable-balance-history/domain/balance-history-change-source';
import { Receivable } from '../../receivables/domain/receivable';
import { Payment } from '../domain/payment';
import { AllocatePaymentUseCase } from './allocate-payment.usecase';

describe('AllocatePaymentUseCase', () => {
  function buildReceivable(customerId = 'cust-1'): Receivable {
    return new Receivable({
      id: 'rec-1',
      organizationId: 'org-1',
      customerId,
      invoiceId: 'inv-1',
      originalAmount: 50_000_000,
      paidAmount: 0,
      dueDate: new Date('2026-08-20'),
      status: ReceivableStatus.OPEN,
      salesRepresentativeId: 'user-1',
      createdAt: new Date('2026-07-20'),
      closedAt: null,
      version: 1,
    });
  }

  function buildPayment(customerId: string | null = 'cust-1'): Payment {
    return new Payment({
      id: 'pay-1',
      organizationId: 'org-1',
      customerId,
      bankTransactionId: null,
      totalAmount: 30_000_000,
      allocatedAmount: 0,
      payerName: 'Công ty B',
      receivedAt: new Date('2026-08-01'),
      createdAt: new Date('2026-08-01'),
    });
  }

  it('allocates payment to receivable and saves both inside a transaction', async () => {
    const receivable = buildReceivable();
    const payment = buildPayment();

    const receivableRepo = {
      findByIdForUpdate: jest.fn().mockResolvedValue(receivable),
      save: jest.fn(),
      findById: jest.fn(),
    };
    const paymentRepo = {
      findByIdForUpdate: jest.fn().mockResolvedValue(payment),
      save: jest.fn(),
    };
    const allocationRepo = { save: jest.fn() };
    const tenantContext = { getOrganizationId: () => 'org-1' };
    const dataSource = {
      transaction: jest.fn((cb: (m: EntityManager) => Promise<void>) =>
        cb({} as EntityManager),
      ),
    };
    const auditContext = { setBefore: jest.fn(), setAfter: jest.fn() };
    const eventEmitter = { emit: jest.fn(), emitAsync: jest.fn() };
    const recorder = { record: jest.fn() };

    const useCase = new AllocatePaymentUseCase(
      receivableRepo as any,
      paymentRepo as any,
      allocationRepo as any,
      dataSource as any,
      tenantContext as any,
      auditContext as any,
      eventEmitter as any,
      recorder as any,
    );

    await useCase.execute({
      paymentId: 'pay-1',
      receivableId: 'rec-1',
      amount: 30_000_000,
      allocatedByUserId: 'user-1',
      provenance: {
        actorType: BalanceHistoryActorType.USER,
        actorUserId: 'user-1',
      },
    });

    expect(receivableRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        paidAmount: 30_000_000,
        status: ReceivableStatus.PARTIALLY_PAID,
      }),
      expect.anything(),
    );
    expect(paymentRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ allocatedAmount: 30_000_000 }),
      expect.anything(),
    );
    expect(allocationRepo.save).toHaveBeenCalled();
    expect(recorder.record).toHaveBeenCalledWith({
      receivable: expect.objectContaining({
        paidAmount: 30_000_000,
        status: ReceivableStatus.PARTIALLY_PAID,
      }),
      changeSource: BalanceHistoryChangeSource.ALLOCATE,
      provenance: {
        actorType: BalanceHistoryActorType.USER,
        actorUserId: 'user-1',
      },
      transitionReferenceId: expect.any(String),
      manager: expect.anything(),
    });
    expect(auditContext.setBefore).toHaveBeenCalledWith({
      payment,
      receivable,
    });
    expect(auditContext.setAfter).not.toHaveBeenCalled();
    expect(eventEmitter.emitAsync).toHaveBeenCalledWith('payment.allocated', {
      paymentId: 'pay-1',
      receivableId: 'rec-1',
      customerId: 'cust-1',
      organizationId: 'org-1',
      amount: 30_000_000,
      allocatedByUserId: 'user-1',
    });
    expect(eventEmitter.emitAsync).not.toHaveBeenCalledWith(
      'receivable.closed',
      expect.anything(),
    );
  });

  it('emits payment.allocated and receivable.closed when the allocation fully pays off the receivable', async () => {
    const receivable = new Receivable({
      id: 'rec-1',
      organizationId: 'org-1',
      customerId: 'cust-1',
      invoiceId: 'inv-1',
      originalAmount: 30_000_000,
      paidAmount: 0,
      dueDate: new Date('2026-08-20'),
      status: ReceivableStatus.OPEN,
      salesRepresentativeId: 'user-1',
      createdAt: new Date('2026-07-20'),
      closedAt: null,
      version: 1,
    });
    const payment = buildPayment();

    const receivableRepo = {
      findByIdForUpdate: jest.fn().mockResolvedValue(receivable),
      save: jest.fn(),
      findById: jest.fn(),
    };
    const paymentRepo = {
      findByIdForUpdate: jest.fn().mockResolvedValue(payment),
      save: jest.fn(),
    };
    const allocationRepo = { save: jest.fn() };
    const tenantContext = { getOrganizationId: () => 'org-1' };
    const dataSource = {
      transaction: jest.fn((cb: (m: EntityManager) => Promise<void>) =>
        cb({} as EntityManager),
      ),
    };
    const auditContext = { setBefore: jest.fn(), setAfter: jest.fn() };
    const eventEmitter = { emit: jest.fn(), emitAsync: jest.fn() };

    const useCase = new AllocatePaymentUseCase(
      receivableRepo as any,
      paymentRepo as any,
      allocationRepo as any,
      dataSource as any,
      tenantContext as any,
      auditContext as any,
      eventEmitter as any,
      { record: jest.fn() } as any,
    );

    await useCase.execute({
      paymentId: 'pay-1',
      receivableId: 'rec-1',
      amount: 30_000_000,
      allocatedByUserId: 'user-1',
      provenance: {
        actorType: BalanceHistoryActorType.USER,
        actorUserId: 'user-1',
      },
    });

    expect(eventEmitter.emitAsync).toHaveBeenCalledWith(
      'payment.allocated',
      expect.objectContaining({ amount: 30_000_000 }),
    );
    expect(eventEmitter.emitAsync).toHaveBeenCalledWith('receivable.closed', {
      receivableId: 'rec-1',
      customerId: 'cust-1',
      organizationId: 'org-1',
    });
    expect(eventEmitter.emitAsync).toHaveBeenCalledWith(
      'receivable.status-closed',
      { receivableId: 'rec-1', organizationId: 'org-1' },
    );
  });

  it.each([0, -1, 1.5])(
    'rejects a non-positive integer allocation: %p',
    async (amount) => {
      const receivableRepo = { findByIdForUpdate: jest.fn(), save: jest.fn() };
      const paymentRepo = { findByIdForUpdate: jest.fn(), save: jest.fn() };
      const allocationRepo = { save: jest.fn() };
      const dataSource = {
        transaction: jest.fn((cb: (m: EntityManager) => Promise<void>) =>
          cb({} as EntityManager),
        ),
      };
      const tenantContext = { getOrganizationId: () => 'org-1' };
      const auditContext = { setBefore: jest.fn(), setAfter: jest.fn() };
      const eventEmitter = { emit: jest.fn(), emitAsync: jest.fn() };
      const useCase = new AllocatePaymentUseCase(
        receivableRepo as any,
        paymentRepo as any,
        allocationRepo as any,
        dataSource as any,
        tenantContext as any,
        auditContext as any,
        eventEmitter as any,
        { record: jest.fn() } as any,
      );

      await expect(
        useCase.execute({
          paymentId: 'pay-1',
          receivableId: 'rec-1',
          amount,
          allocatedByUserId: 'user-1',
          provenance: {
            actorType: BalanceHistoryActorType.USER,
            actorUserId: 'user-1',
          },
        }),
      ).rejects.toMatchObject({ errorCode: ErrorCode.VALIDATION_ERROR });
      expect(receivableRepo.findByIdForUpdate).not.toHaveBeenCalled();
    },
  );

  it('throws if receivable not found', async () => {
    const receivableRepo = {
      findByIdForUpdate: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
      findById: jest.fn(),
    };
    const paymentRepo = {
      findByIdForUpdate: jest.fn().mockResolvedValue(buildPayment()),
      save: jest.fn(),
    };
    const allocationRepo = { save: jest.fn() };
    const dataSource = {
      transaction: jest.fn((cb: (m: EntityManager) => Promise<void>) =>
        cb({} as EntityManager),
      ),
    };

    const eventEmitter = { emit: jest.fn(), emitAsync: jest.fn() };

    const useCase = new AllocatePaymentUseCase(
      receivableRepo as any,
      paymentRepo as any,
      allocationRepo as any,
      dataSource as any,
      { getOrganizationId: () => 'org-1' } as any,
      { setBefore: jest.fn(), setAfter: jest.fn() } as any,
      eventEmitter as any,
      { record: jest.fn() } as any,
    );

    await expect(
      useCase.execute({
        paymentId: 'pay-1',
        receivableId: 'missing',
        amount: 1000,
        allocatedByUserId: 'user-1',
        provenance: {
          actorType: BalanceHistoryActorType.USER,
          actorUserId: 'user-1',
        },
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.RECEIVABLE_NOT_FOUND });
    expect(eventEmitter.emitAsync).not.toHaveBeenCalled();
  });

  it('rejects allocation when the payment has no resolved customer', async () => {
    const receivable = buildReceivable();
    const payment = buildPayment(null);
    const receivableRepo = {
      findByIdForUpdate: jest.fn().mockResolvedValue(receivable),
      save: jest.fn(),
    };
    const paymentRepo = {
      findByIdForUpdate: jest.fn().mockResolvedValue(payment),
      save: jest.fn(),
    };
    const allocationRepo = { save: jest.fn() };
    const dataSource = {
      transaction: jest.fn((cb: (m: EntityManager) => Promise<void>) =>
        cb({} as EntityManager),
      ),
    };
    const useCase = new AllocatePaymentUseCase(
      receivableRepo as any,
      paymentRepo as any,
      allocationRepo as any,
      dataSource as any,
      { getOrganizationId: () => 'org-1' } as any,
      { setBefore: jest.fn(), setAfter: jest.fn() } as any,
      { emit: jest.fn(), emitAsync: jest.fn() } as any,
      { record: jest.fn() } as any,
    );

    await expect(
      useCase.execute({
        paymentId: payment.id,
        receivableId: receivable.id,
        amount: 1_000_000,
        allocatedByUserId: 'u1',
        provenance: {
          actorType: BalanceHistoryActorType.USER,
          actorUserId: 'u1',
        },
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.PAYMENT_CUSTOMER_UNRESOLVED,
    });
  });

  it('rejects allocation when the payment and receivable belong to different customers', async () => {
    const receivable = buildReceivable('cust-2');
    const payment = buildPayment('cust-1');
    const receivableRepo = {
      findByIdForUpdate: jest.fn().mockResolvedValue(receivable),
      save: jest.fn(),
    };
    const paymentRepo = {
      findByIdForUpdate: jest.fn().mockResolvedValue(payment),
      save: jest.fn(),
    };
    const allocationRepo = { save: jest.fn() };
    const dataSource = {
      transaction: jest.fn((cb: (m: EntityManager) => Promise<void>) =>
        cb({} as EntityManager),
      ),
    };
    const useCase = new AllocatePaymentUseCase(
      receivableRepo as any,
      paymentRepo as any,
      allocationRepo as any,
      dataSource as any,
      { getOrganizationId: () => 'org-1' } as any,
      { setBefore: jest.fn(), setAfter: jest.fn() } as any,
      { emit: jest.fn(), emitAsync: jest.fn() } as any,
      { record: jest.fn() } as any,
    );

    await expect(
      useCase.execute({
        paymentId: payment.id,
        receivableId: receivable.id,
        amount: 1_000_000,
        allocatedByUserId: 'u1',
        provenance: {
          actorType: BalanceHistoryActorType.USER,
          actorUserId: 'u1',
        },
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.CUSTOMER_MISMATCH });
  });

  it('maps a receivable over-allocation to ALLOCATION_EXCEEDS_REMAINING instead of an unhandled error', async () => {
    const receivable = buildReceivable();
    // originalAmount is 50_000_000 by default; shrink remainingAmount to
    // 10_000_000 so the receivable's own limit is hit before the payment's.
    const smallReceivable = new Receivable({
      ...receivable,
      originalAmount: 10_000_000,
    });
    const payment = buildPayment();
    const receivableRepo = {
      findByIdForUpdate: jest.fn().mockResolvedValue(smallReceivable),
      save: jest.fn(),
    };
    const paymentRepo = {
      findByIdForUpdate: jest.fn().mockResolvedValue(payment),
      save: jest.fn(),
    };
    const allocationRepo = { save: jest.fn() };
    const recorder = { record: jest.fn() };
    const dataSource = {
      transaction: jest.fn((cb: (m: EntityManager) => Promise<void>) =>
        cb({} as EntityManager),
      ),
    };
    const useCase = new AllocatePaymentUseCase(
      receivableRepo as any,
      paymentRepo as any,
      allocationRepo as any,
      dataSource as any,
      { getOrganizationId: () => 'org-1' } as any,
      { setBefore: jest.fn(), setAfter: jest.fn() } as any,
      { emit: jest.fn(), emitAsync: jest.fn() } as any,
      recorder as any,
    );

    await expect(
      useCase.execute({
        paymentId: payment.id,
        receivableId: smallReceivable.id,
        amount: 20_000_000, // exceeds the 10_000_000 remainingAmount, within payment's 30_000_000 unallocatedAmount
        allocatedByUserId: 'u1',
        provenance: {
          actorType: BalanceHistoryActorType.USER,
          actorUserId: 'u1',
        },
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.ALLOCATION_EXCEEDS_REMAINING,
    });
    expect(receivableRepo.save).not.toHaveBeenCalled();
    expect(paymentRepo.save).not.toHaveBeenCalled();
    expect(recorder.record).not.toHaveBeenCalled();
  });

  it('maps allocation against a closed receivable to CONFLICT, not ALLOCATION_EXCEEDS_REMAINING', async () => {
    const receivable = buildReceivable();
    const closedReceivable = new Receivable({
      ...receivable,
      status: ReceivableStatus.WRITTEN_OFF,
    });
    const payment = buildPayment();
    const receivableRepo = {
      findByIdForUpdate: jest.fn().mockResolvedValue(closedReceivable),
      save: jest.fn(),
    };
    const paymentRepo = {
      findByIdForUpdate: jest.fn().mockResolvedValue(payment),
      save: jest.fn(),
    };
    const allocationRepo = { save: jest.fn() };
    const dataSource = {
      transaction: jest.fn((cb: (m: EntityManager) => Promise<void>) =>
        cb({} as EntityManager),
      ),
    };
    const useCase = new AllocatePaymentUseCase(
      receivableRepo as any,
      paymentRepo as any,
      allocationRepo as any,
      dataSource as any,
      { getOrganizationId: () => 'org-1' } as any,
      { setBefore: jest.fn(), setAfter: jest.fn() } as any,
      { emit: jest.fn(), emitAsync: jest.fn() } as any,
      { record: jest.fn() } as any,
    );

    await expect(
      useCase.execute({
        paymentId: payment.id,
        receivableId: closedReceivable.id,
        amount: 1_000_000,
        allocatedByUserId: 'u1',
        provenance: {
          actorType: BalanceHistoryActorType.USER,
          actorUserId: 'u1',
        },
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.CONFLICT });
    expect(receivableRepo.save).not.toHaveBeenCalled();
    expect(paymentRepo.save).not.toHaveBeenCalled();
  });

  it('maps a payment over-allocation to ALLOCATION_EXCEEDS_UNALLOCATED instead of an unhandled error', async () => {
    const receivable = buildReceivable();
    const payment = buildPayment();
    const receivableRepo = {
      findByIdForUpdate: jest.fn().mockResolvedValue(receivable),
      save: jest.fn(),
    };
    const paymentRepo = {
      findByIdForUpdate: jest.fn().mockResolvedValue(payment),
      save: jest.fn(),
    };
    const allocationRepo = { save: jest.fn() };
    const dataSource = {
      transaction: jest.fn((cb: (m: EntityManager) => Promise<void>) =>
        cb({} as EntityManager),
      ),
    };
    const useCase = new AllocatePaymentUseCase(
      receivableRepo as any,
      paymentRepo as any,
      allocationRepo as any,
      dataSource as any,
      { getOrganizationId: () => 'org-1' } as any,
      { setBefore: jest.fn(), setAfter: jest.fn() } as any,
      { emit: jest.fn(), emitAsync: jest.fn() } as any,
      { record: jest.fn() } as any,
    );

    await expect(
      useCase.execute({
        paymentId: payment.id,
        receivableId: receivable.id,
        amount: 40_000_000, // within receivable's 50_000_000 remainingAmount, exceeds payment's 30_000_000 unallocatedAmount
        allocatedByUserId: 'u1',
        provenance: {
          actorType: BalanceHistoryActorType.USER,
          actorUserId: 'u1',
        },
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.ALLOCATION_EXCEEDS_UNALLOCATED,
    });
    expect(receivableRepo.save).not.toHaveBeenCalled();
    expect(paymentRepo.save).not.toHaveBeenCalled();
  });
});
