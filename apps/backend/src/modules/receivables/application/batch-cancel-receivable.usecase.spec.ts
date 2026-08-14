import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { BatchCancelReceivableUseCase } from './batch-cancel-receivable.usecase';
import { CancelReceivableUseCase } from './cancel-receivable.usecase';

describe('BatchCancelReceivableUseCase', () => {
  it('cancels each receivable independently and audits only the successes', async () => {
    const cancelUseCase = {
      execute: jest.fn(async (id: string) => {
        if (id === 'rec-has-payments') {
          throw new AppError(
            ErrorCode.RECEIVABLE_HAS_PAYMENTS,
            'Không thể hủy khoản phải thu đã nhận thanh toán.',
          );
        }
        return { id, status: 'CANCELLED' };
      }),
    } as unknown as CancelReceivableUseCase;
    const auditLogRepo = { create: jest.fn() };
    const tenantContext = {
      getCurrentUser: () => ({
        userId: 'user-1',
        organizationId: 'org-1',
        role: 'FINANCE_MANAGER',
      }),
    } as unknown as TenantContextService;

    const useCase = new BatchCancelReceivableUseCase(
      cancelUseCase,
      auditLogRepo as never,
      tenantContext,
    );

    const results = await useCase.execute(['rec-ok', 'rec-has-payments']);

    expect(results[0].status).toBe('success');
    expect(results[1]).toEqual({
      id: 'rec-has-payments',
      status: 'error',
      errorCode: ErrorCode.RECEIVABLE_HAS_PAYMENTS,
      message: 'Không thể hủy khoản phải thu đã nhận thanh toán.',
    });
    expect(auditLogRepo.create).toHaveBeenCalledTimes(1);
  });
});
