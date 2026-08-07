import { ReceivableStatus } from '@casso-ledger/shared-types';
import type { EntityManager } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { Receivable } from '../../receivables/domain/receivable';
import { BankTransaction } from '../../webhooks/domain/bank-transaction';
import { MatchBankTransactionUseCase } from './match-bank-transaction.usecase';

function buildTransaction(
  overrides: Partial<
    Pick<BankTransaction, 'version' | 'status' | 'amount'>
  > = {},
): BankTransaction {
  return new BankTransaction({
    id: 'bt-1',
    organizationId: 'org-1',
    bankConnectionId: 'conn-1',
    webhookInboxId: 'wh-1',
    providerTransactionId: 'TX-001',
    amount: overrides.amount ?? 30_000_000,
    transactionDateTime: new Date('2026-08-01'),
    counterpartyAccountNumber: '0011002233',
    counterpartyName: 'CONG TY B',
    transferContent: 'payment',
    status: overrides.status ?? 'PENDING_REVIEW',
    version: overrides.version ?? 1,
    createdAt: new Date('2026-08-01'),
  });
}

function buildReceivable(id: string, customerId = 'cust-1'): Receivable {
  return new Receivable({
    id,
    organizationId: 'org-1',
    customerId,
    invoiceId: null,
    originalAmount: 30_000_000,
    paidAmount: 0,
    dueDate: new Date('2026-08-20'),
    status: ReceivableStatus.OPEN,
    salesRepresentativeId: null,
    createdAt: new Date('2026-07-20'),
    closedAt: null,
    version: 1,
  });
}

function buildUseCase(
  options: {
    transaction?: BankTransaction | null;
    receivables?: Record<string, Receivable | null>;
  } = {},
) {
  const bankTransactionRepo = {
    findByIdForUpdate: jest
      .fn()
      .mockResolvedValue(options.transaction ?? buildTransaction()),
    save: jest.fn(),
  };
  const receivableRepo = {
    findByIdForUpdate: jest.fn((id: string) =>
      Promise.resolve(options.receivables?.[id] ?? null),
    ),
  };
  const paymentRepo = { save: jest.fn() };
  const allocatePaymentUseCase = {
    allocateWithinTransaction: jest.fn(),
  };
  const manager = {} as EntityManager;
  const dataSource = {
    transaction: jest.fn(
      (callback: (value: EntityManager) => Promise<unknown>) =>
        callback(manager),
    ),
  };
  const tenantContext = { getOrganizationId: () => 'org-1' };
  const auditContext = {
    setBefore: jest.fn(),
    setAfter: jest.fn(),
  };

  const useCase = new MatchBankTransactionUseCase(
    bankTransactionRepo as never,
    receivableRepo as never,
    paymentRepo as never,
    allocatePaymentUseCase as never,
    dataSource as never,
    tenantContext as never,
    auditContext as never,
  );
  return {
    useCase,
    bankTransactionRepo,
    receivableRepo,
    paymentRepo,
    allocatePaymentUseCase,
    auditContext,
  };
}

const input = {
  bankTransactionId: 'bt-1',
  allocations: [{ receivableId: 'rec-1', amount: 30_000_000 }],
  version: 1,
  allocatedByUserId: 'user-1',
};

describe('MatchBankTransactionUseCase', () => {
  it('rejects a stale version with OPTIMISTIC_LOCK_CONFLICT', async () => {
    const { useCase } = buildUseCase({
      transaction: buildTransaction({ version: 2 }),
    });

    await expect(useCase.execute(input)).rejects.toMatchObject({
      errorCode: ErrorCode.OPTIMISTIC_LOCK_CONFLICT,
    });
  });

  it('rejects a transaction that is no longer pending review', async () => {
    const { useCase } = buildUseCase({
      transaction: buildTransaction({ status: 'MATCHED' }),
    });

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(AppError);
  });

  it('rejects allocations whose sum exceeds the transaction amount', async () => {
    const { useCase } = buildUseCase({
      transaction: buildTransaction({ amount: 20_000_000 }),
      receivables: { 'rec-1': buildReceivable('rec-1') },
    });

    await expect(
      useCase.execute({
        ...input,
        allocations: [{ receivableId: 'rec-1', amount: 25_000_000 }],
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.VALIDATION_ERROR });
  });

  it('rejects an allocation whose receivable does not exist', async () => {
    const { useCase } = buildUseCase();

    await expect(useCase.execute(input)).rejects.toMatchObject({
      errorCode: ErrorCode.RECEIVABLE_NOT_FOUND,
    });
  });

  it('creates one payment, allocates each item, and marks the transaction matched', async () => {
    const {
      useCase,
      bankTransactionRepo,
      paymentRepo,
      allocatePaymentUseCase,
      auditContext,
    } = buildUseCase({
      receivables: {
        'rec-1': buildReceivable('rec-1'),
        'rec-2': buildReceivable('rec-2'),
      },
    });

    const result = await useCase.execute({
      ...input,
      allocations: [
        { receivableId: 'rec-1', amount: 15_000_000 },
        { receivableId: 'rec-2', amount: 10_000_000 },
      ],
    });

    expect(paymentRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'cust-1',
        totalAmount: 30_000_000,
        allocatedAmount: 0,
      }),
      expect.anything(),
    );
    expect(
      allocatePaymentUseCase.allocateWithinTransaction,
    ).toHaveBeenCalledTimes(2);
    expect(bankTransactionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'MATCHED' }),
      expect.anything(),
    );
    expect(auditContext.setBefore).toHaveBeenCalled();
    expect(result.status).toBe('MATCHED');
  });

  it('rejects receivables belonging to different customers', async () => {
    const { useCase } = buildUseCase({
      receivables: {
        'rec-1': buildReceivable('rec-1', 'cust-1'),
        'rec-2': buildReceivable('rec-2', 'cust-2'),
      },
    });

    await expect(
      useCase.execute({
        ...input,
        allocations: [
          { receivableId: 'rec-1', amount: 10_000_000 },
          { receivableId: 'rec-2', amount: 10_000_000 },
        ],
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.CUSTOMER_MISMATCH });
  });
});
