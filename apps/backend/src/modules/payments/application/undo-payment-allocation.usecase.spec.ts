import { ReceivableStatus } from '@casso-ar/shared-types';
import type { EntityManager } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { BalanceHistoryActorType } from '../../receivable-balance-history/domain/balance-history-actor-type';
import { BalanceHistoryChangeSource } from '../../receivable-balance-history/domain/balance-history-change-source';
import { Receivable } from '../../receivables/domain/receivable';
import { Payment } from '../domain/payment';
import { PaymentAllocation } from '../domain/payment-allocation';
import { UndoPaymentAllocationUseCase } from './undo-payment-allocation.usecase';

describe('UndoPaymentAllocationUseCase', () => {
  it('soft-deletes once, rolls back both rollups, and audits before/after state', async () => {
    const allocation = new PaymentAllocation({
      id: 'alloc-1',
      organizationId: 'org-1',
      paymentId: 'pay-1',
      receivableId: 'rec-1',
      allocatedAmount: 30_000_000,
      allocatedAt: new Date(),
      allocatedByUserId: 'user-1',
      deletedAt: null,
      deletedByUserId: null,
      undoReason: null,
      createdAt: new Date(),
    });
    const payment = new Payment({
      id: 'pay-1',
      organizationId: 'org-1',
      customerId: 'cust-1',
      bankTransactionId: null,
      totalAmount: 50_000_000,
      allocatedAmount: 30_000_000,
      payerName: 'Công ty B',
      receivedAt: new Date(),
      createdAt: new Date(),
    });
    const receivable = new Receivable({
      id: 'rec-1',
      organizationId: 'org-1',
      customerId: 'cust-1',
      invoiceId: null,
      originalAmount: 50_000_000,
      paidAmount: 30_000_000,
      dueDate: new Date(),
      status: ReceivableStatus.PARTIALLY_PAID,
      salesRepresentativeId: null,
      createdAt: new Date(),
      closedAt: null,
      version: 1,
    });
    const manager = {} as EntityManager;
    const allocationRepo = {
      findByIdForUpdate: jest
        .fn()
        .mockResolvedValueOnce(allocation)
        .mockResolvedValueOnce(allocation.undo('user-1', 'duplicate')),
      save: jest.fn(),
    };
    const paymentRepo = {
      findByIdForUpdate: jest.fn().mockResolvedValue(payment),
      save: jest.fn(),
    };
    const receivableRepo = {
      findByIdForUpdate: jest.fn().mockResolvedValue(receivable),
      save: jest.fn(),
    };
    const auditLogRepo = { create: jest.fn() };
    const recorder = { record: jest.fn() };
    const ledgerRecorder = { record: jest.fn() };
    const dataSource = {
      transaction: jest.fn((callback) => callback(manager)),
    };
    const useCase = new UndoPaymentAllocationUseCase(
      allocationRepo as any,
      paymentRepo as any,
      receivableRepo as any,
      auditLogRepo as any,
      dataSource as any,
      recorder as any,
      ledgerRecorder as any,
    );

    await useCase.execute({
      allocationId: 'alloc-1',
      deletedByUserId: 'user-2',
      undoReason: 'Correction',
    });
    expect(paymentRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ allocatedAmount: 0 }),
      manager,
    );
    expect(receivableRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ paidAmount: 0, status: ReceivableStatus.OPEN }),
      manager,
    );
    expect(auditLogRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'PAYMENT_ALLOCATE_UNDO',
        relatedReceivableId: 'rec-1',
      }),
      manager,
    );
    expect(recorder.record).toHaveBeenCalledWith({
      receivable: expect.objectContaining({
        id: 'rec-1',
        paidAmount: 0,
        status: ReceivableStatus.OPEN,
      }),
      changeSource: BalanceHistoryChangeSource.UNDO,
      provenance: {
        actorType: BalanceHistoryActorType.USER,
        actorUserId: 'user-2',
      },
      transitionReferenceId: 'alloc-1',
      note: 'Correction',
      manager,
    });
    await expect(
      useCase.execute({
        allocationId: 'alloc-1',
        deletedByUserId: 'user-2',
        undoReason: 'Again',
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.ALLOCATION_ALREADY_UNDONE,
    });
    expect(auditLogRepo.create).toHaveBeenCalledTimes(1);
    expect(recorder.record).toHaveBeenCalledTimes(1);
  });

  it('records both sides of the undo as ledger events', async () => {
    const allocation = new PaymentAllocation({
      id: 'alloc-1',
      organizationId: 'org-1',
      paymentId: 'pay-1',
      receivableId: 'rec-1',
      allocatedAmount: 30_000_000,
      allocatedAt: new Date(),
      allocatedByUserId: 'user-1',
      deletedAt: null,
      deletedByUserId: null,
      undoReason: null,
      createdAt: new Date(),
    });
    const payment = new Payment({
      id: 'pay-1',
      organizationId: 'org-1',
      customerId: 'cust-1',
      bankTransactionId: null,
      totalAmount: 50_000_000,
      allocatedAmount: 30_000_000,
      payerName: 'Công ty B',
      receivedAt: new Date(),
      createdAt: new Date(),
    });
    const receivable = new Receivable({
      id: 'rec-1',
      organizationId: 'org-1',
      customerId: 'cust-1',
      invoiceId: null,
      originalAmount: 50_000_000,
      paidAmount: 30_000_000,
      dueDate: new Date(),
      status: ReceivableStatus.PARTIALLY_PAID,
      salesRepresentativeId: null,
      createdAt: new Date(),
      closedAt: null,
      version: 1,
    });
    const manager = {} as EntityManager;
    const allocationRepo = {
      findByIdForUpdate: jest.fn().mockResolvedValue(allocation),
      save: jest.fn(),
    };
    const paymentRepo = {
      findByIdForUpdate: jest.fn().mockResolvedValue(payment),
      save: jest.fn(),
    };
    const receivableRepo = {
      findByIdForUpdate: jest.fn().mockResolvedValue(receivable),
      save: jest.fn(),
    };
    const auditLogRepo = { create: jest.fn() };
    const historyRecorder = { record: jest.fn() };
    const ledgerRecorder = { record: jest.fn() };
    const dataSource = {
      transaction: jest.fn((callback) => callback(manager)),
    };
    const useCase = new UndoPaymentAllocationUseCase(
      allocationRepo as any,
      paymentRepo as any,
      receivableRepo as any,
      auditLogRepo as any,
      dataSource as any,
      historyRecorder as any,
      ledgerRecorder as any,
    );

    await useCase.execute({
      allocationId: 'alloc-1',
      deletedByUserId: 'user-2',
      undoReason: 'Correction',
    });

    expect(ledgerRecorder.record).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectType: 'RECEIVABLE',
        kind: 'RECEIVABLE_ALLOCATION_UNDONE',
        amount: 30_000_000,
        transitionReferenceId: 'alloc-1',
      }),
    );
    expect(ledgerRecorder.record).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectType: 'PAYMENT',
        kind: 'PAYMENT_ALLOCATION_UNDONE',
        amount: 30_000_000,
        transitionReferenceId: 'alloc-1',
      }),
    );
  });
});
