import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { BatchMatchBankTransactionUseCase } from './batch-match-bank-transaction.usecase';
import { MatchBankTransactionUseCase } from './match-bank-transaction.usecase';

describe('BatchMatchBankTransactionUseCase', () => {
  it('matches each item with its own allocations/version and reports per-item results', async () => {
    const matchUseCase = {
      execute: jest.fn(async ({ bankTransactionId }) => {
        if (bankTransactionId === 'tx-stale') {
          throw new AppError(
            ErrorCode.OPTIMISTIC_LOCK_CONFLICT,
            'Giao dịch đã được xử lý bởi người dùng khác.',
          );
        }
        return { id: bankTransactionId, status: 'MATCHED' };
      }),
    } as unknown as MatchBankTransactionUseCase;
    const auditLogRepo = { create: jest.fn() };
    const tenantContext = {
      getCurrentUser: () => ({
        userId: 'user-1',
        organizationId: 'org-1',
        role: 'ACCOUNTANT',
      }),
    } as unknown as TenantContextService;

    const useCase = new BatchMatchBankTransactionUseCase(
      matchUseCase,
      auditLogRepo as never,
      tenantContext,
    );

    const results = await useCase.execute([
      {
        bankTransactionId: 'tx-ok',
        allocations: [{ receivableId: 'rec-1', amount: 10_000 }],
        version: 1,
      },
      {
        bankTransactionId: 'tx-stale',
        allocations: [{ receivableId: 'rec-2', amount: 5_000 }],
        version: 1,
      },
    ]);

    expect(matchUseCase.execute).toHaveBeenCalledWith({
      bankTransactionId: 'tx-ok',
      allocations: [{ receivableId: 'rec-1', amount: 10_000 }],
      version: 1,
      allocatedByUserId: 'user-1',
    });
    expect(results[0].status).toBe('success');
    expect(results[1]).toEqual({
      id: 'tx-stale',
      status: 'error',
      errorCode: ErrorCode.OPTIMISTIC_LOCK_CONFLICT,
      message: 'Giao dịch đã được xử lý bởi người dùng khác.',
    });
    expect(auditLogRepo.create).toHaveBeenCalledTimes(1);
  });
});
