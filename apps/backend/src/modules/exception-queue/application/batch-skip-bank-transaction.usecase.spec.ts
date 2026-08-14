import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { BankTransaction } from '../../webhooks/domain/bank-transaction';
import { BatchSkipBankTransactionUseCase } from './batch-skip-bank-transaction.usecase';
import { SkipBankTransactionUseCase } from './skip-bank-transaction.usecase';

function buildTransaction(id: string): BankTransaction {
  return new BankTransaction({
    id,
    organizationId: 'org-1',
    bankConnectionId: 'conn-1',
    webhookInboxId: 'inbox-1',
    providerTransactionId: `TX-${id}`,
    amount: 10_000,
    transactionDateTime: new Date('2026-08-01'),
    counterpartyAccountNumber: '0011002233',
    counterpartyName: 'Customer',
    transferContent: 'note',
    status: 'IGNORED',
    version: 2,
    createdAt: new Date('2026-08-01'),
  });
}

describe('BatchSkipBankTransactionUseCase', () => {
  it('skips each transaction independently and audits only the successes', async () => {
    const skipUseCase = {
      execute: jest.fn(async (id: string) => {
        if (id === 'tx-fail') {
          throw new AppError(ErrorCode.CONFLICT, 'Giao dịch đã được xử lý.');
        }
        return buildTransaction(id);
      }),
    } as unknown as SkipBankTransactionUseCase;
    const auditLogRepo = { create: jest.fn().mockResolvedValue(undefined) };
    const logger = { error: jest.fn() };
    const tenantContext = {
      getCurrentUser: () => ({
        userId: 'user-1',
        organizationId: 'org-1',
        role: 'ACCOUNTANT',
      }),
    } as unknown as TenantContextService;

    const useCase = new BatchSkipBankTransactionUseCase(
      skipUseCase,
      auditLogRepo as never,
      tenantContext,
      logger as never,
    );

    const results = await useCase.execute(['tx-ok', 'tx-fail']);

    expect(results).toEqual([
      { id: 'tx-ok', status: 'success', data: buildTransaction('tx-ok') },
      {
        id: 'tx-fail',
        status: 'error',
        errorCode: ErrorCode.CONFLICT,
        message: 'Giao dịch đã được xử lý.',
      },
    ]);
    expect(auditLogRepo.create).toHaveBeenCalledTimes(1);
    expect(auditLogRepo.create.mock.calls[0][0]).toMatchObject({
      entityId: 'tx-ok',
      organizationId: 'org-1',
      userId: 'user-1',
    });
  });

  it('keeps the transaction successful when audit persistence fails', async () => {
    const skipUseCase = {
      execute: jest.fn(async (id: string) => buildTransaction(id)),
    } as unknown as SkipBankTransactionUseCase;
    const auditLogRepo = {
      create: jest.fn().mockRejectedValue(new Error('audit unavailable')),
    };
    const logger = { error: jest.fn() };
    const tenantContext = {
      getCurrentUser: () => ({
        userId: 'user-1',
        organizationId: 'org-1',
        role: 'ACCOUNTANT',
      }),
    } as unknown as TenantContextService;

    const useCase = new BatchSkipBankTransactionUseCase(
      skipUseCase,
      auditLogRepo as never,
      tenantContext,
      logger as never,
    );

    await expect(useCase.execute(['tx-ok'])).resolves.toEqual([
      { id: 'tx-ok', status: 'success', data: buildTransaction('tx-ok') },
    ]);
  });
});
