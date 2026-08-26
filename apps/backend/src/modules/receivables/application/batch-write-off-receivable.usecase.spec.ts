import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { BatchWriteOffReceivableUseCase } from './batch-write-off-receivable.usecase';
import { WriteOffReceivableUseCase } from './write-off-receivable.usecase';

describe('BatchWriteOffReceivableUseCase', () => {
  it('writes off each receivable independently and audits only the successes', async () => {
    const writeOffUseCase = {
      execute: jest.fn(async (id: string) => {
        if (id === 'rec-missing') {
          throw new AppError(
            ErrorCode.RECEIVABLE_NOT_FOUND,
            'Không tìm thấy khoản phải thu.',
          );
        }
        return { id, status: 'WRITTEN_OFF' };
      }),
    } as unknown as WriteOffReceivableUseCase;
    const auditLogRepo = { create: jest.fn().mockResolvedValue(undefined) };
    const logger = { error: jest.fn() };
    const tenantContext = {
      getCurrentUser: () => ({
        userId: 'user-1',
        organizationId: 'org-1',
        role: 'FINANCE_MANAGER',
      }),
    } as unknown as TenantContextService;

    const useCase = new BatchWriteOffReceivableUseCase(
      writeOffUseCase,
      auditLogRepo as never,
      tenantContext,
      logger as never,
    );

    const results = await useCase.execute(['rec-ok', 'rec-missing']);

    expect(results[0].status).toBe('success');
    expect(results[1]).toEqual({
      id: 'rec-missing',
      status: 'error',
      errorCode: ErrorCode.RECEIVABLE_NOT_FOUND,
      message: 'Không tìm thấy khoản phải thu.',
    });
    expect(auditLogRepo.create).toHaveBeenCalledTimes(1);
    expect(auditLogRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'rec-ok',
        relatedReceivableId: 'rec-ok',
      }),
    );
  });
});
