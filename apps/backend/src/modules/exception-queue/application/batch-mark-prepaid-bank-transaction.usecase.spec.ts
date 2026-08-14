import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { BatchMarkPrepaidBankTransactionUseCase } from './batch-mark-prepaid-bank-transaction.usecase';
import { MarkPrepaidBankTransactionUseCase } from './mark-prepaid-bank-transaction.usecase';

describe('BatchMarkPrepaidBankTransactionUseCase', () => {
  it('applies the same customer to every transaction and reports per-item results', async () => {
    const markPrepaidUseCase = {
      execute: jest.fn(async ({ bankTransactionId, customerId }) => {
        if (bankTransactionId === 'tx-fail') {
          throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy khách hàng.');
        }
        return {
          transaction: { id: bankTransactionId, status: 'PREPAID' },
          payment: { id: `pay-${bankTransactionId}`, customerId },
        };
      }),
    } as unknown as MarkPrepaidBankTransactionUseCase;
    const auditLogRepo = { create: jest.fn() };
    const tenantContext = {
      getCurrentUser: () => ({
        userId: 'user-1',
        organizationId: 'org-1',
        role: 'ACCOUNTANT',
      }),
    } as unknown as TenantContextService;

    const useCase = new BatchMarkPrepaidBankTransactionUseCase(
      markPrepaidUseCase,
      auditLogRepo as never,
      tenantContext,
    );

    const results = await useCase.execute(['tx-ok', 'tx-fail'], 'cust-1');

    expect(markPrepaidUseCase.execute).toHaveBeenCalledWith({
      bankTransactionId: 'tx-ok',
      customerId: 'cust-1',
    });
    expect(results[0].status).toBe('success');
    expect(results[1]).toEqual({
      id: 'tx-fail',
      status: 'error',
      errorCode: ErrorCode.NOT_FOUND,
      message: 'Không tìm thấy khách hàng.',
    });
    expect(auditLogRepo.create).toHaveBeenCalledTimes(1);
  });
});
