import { ReceivableStatus } from '@casso-ledger/shared-types';
import type { EntityManager } from 'typeorm';
import { ErrorCode } from '../../../common/errors/error-code';
import { Receivable } from '../../receivables/domain/receivable';
import { Payment } from '../domain/payment';
import { AllocatePaymentUseCase } from './allocate-payment.usecase';

describe('AllocatePaymentUseCase', () => {
  function buildReceivable(): Receivable {
    return new Receivable({
      id: 'rec-1',
      organizationId: 'org-1',
      customerId: 'cust-1',
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

  function buildPayment(): Payment {
    return new Payment({
      id: 'pay-1',
      organizationId: 'org-1',
      customerId: 'cust-1',
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

    const useCase = new AllocatePaymentUseCase(
      receivableRepo as any,
      paymentRepo as any,
      allocationRepo as any,
      dataSource as any,
      tenantContext as any,
      auditContext as any,
    );

    await useCase.execute({
      paymentId: 'pay-1',
      receivableId: 'rec-1',
      amount: 30_000_000,
      allocatedByUserId: 'user-1',
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
    expect(auditContext.setBefore).toHaveBeenCalledWith({
      payment,
      receivable,
    });
    expect(auditContext.setAfter).not.toHaveBeenCalled();
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
      const useCase = new AllocatePaymentUseCase(
        receivableRepo as any,
        paymentRepo as any,
        allocationRepo as any,
        dataSource as any,
        tenantContext as any,
        auditContext as any,
      );

      await expect(
        useCase.execute({
          paymentId: 'pay-1',
          receivableId: 'rec-1',
          amount,
          allocatedByUserId: 'user-1',
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

    const useCase = new AllocatePaymentUseCase(
      receivableRepo as any,
      paymentRepo as any,
      allocationRepo as any,
      dataSource as any,
      { getOrganizationId: () => 'org-1' } as any,
      { setBefore: jest.fn(), setAfter: jest.fn() } as any,
    );

    await expect(
      useCase.execute({
        paymentId: 'pay-1',
        receivableId: 'missing',
        amount: 1000,
        allocatedByUserId: 'user-1',
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.RECEIVABLE_NOT_FOUND });
  });
});
