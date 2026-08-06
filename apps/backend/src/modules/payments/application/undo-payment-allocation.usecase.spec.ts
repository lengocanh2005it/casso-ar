import { ReceivableStatus } from '@casso-ledger/shared-types';
import type { EntityManager } from 'typeorm';
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
    const dataSource = {
      transaction: jest.fn((callback) => callback(manager)),
    };
    const useCase = new UndoPaymentAllocationUseCase(
      allocationRepo as any,
      paymentRepo as any,
      receivableRepo as any,
      auditLogRepo as any,
      dataSource as any,
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
      expect.objectContaining({ actionType: 'PAYMENT_ALLOCATE_UNDO' }),
      manager,
    );
    await expect(
      useCase.execute({
        allocationId: 'alloc-1',
        deletedByUserId: 'user-2',
        undoReason: 'Again',
      }),
    ).rejects.toThrow('already undone');
    expect(auditLogRepo.create).toHaveBeenCalledTimes(1);
  });
});
