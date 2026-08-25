import { ReceivableStatus } from '@casso-ar/shared-types';
import type { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { Receivable } from '../../receivables/domain/receivable';
import { CollectionActivityType } from '../domain/collection-activity';
import { RecordManualActivityUseCase } from './record-manual-activity.usecase';

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
    version: 0,
  });
}

describe('RecordManualActivityUseCase', () => {
  it('records a MANUAL_CALL activity with the receivable customerId and current org', async () => {
    const receivableRepo = {
      findById: jest.fn().mockResolvedValue(buildReceivable()),
      findByIdForUpdate: jest.fn(),
      save: jest.fn(),
    };
    const activityRepo = {
      create: jest.fn(),
      findByReceivableId: jest.fn(),
      findByCustomerId: jest.fn(),
    };
    const tenantContext = { getOrganizationId: () => 'org-1' };
    const dataSource = {
      transaction: jest.fn((cb: (m: unknown) => Promise<void>) => cb({})),
    };

    const useCase = new RecordManualActivityUseCase(
      activityRepo as any,
      receivableRepo as any,
      tenantContext as any,
      dataSource as any,
    );

    const activity = await useCase.execute({
      receivableId: 'rec-1',
      activityType: CollectionActivityType.MANUAL_CALL,
      description: 'Called; customer promised to pay next week',
      createdByUserId: 'user-2',
    });

    expect(activity.activityType).toBe(CollectionActivityType.MANUAL_CALL);
    expect(activity.customerId).toBe('cust-1');
    expect(activityRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        receivableId: 'rec-1',
        customerId: 'cust-1',
        activityType: CollectionActivityType.MANUAL_CALL,
        createdByUserId: 'user-2',
      }),
      expect.anything(),
    );
  });

  it('throws if the receivable does not exist', async () => {
    const receivableRepo = {
      findById: jest.fn().mockResolvedValue(null),
      findByIdForUpdate: jest.fn(),
      save: jest.fn(),
    };
    const activityRepo = {
      create: jest.fn(),
      findByReceivableId: jest.fn(),
      findByCustomerId: jest.fn(),
    };
    const tenantContext = { getOrganizationId: () => 'org-1' };
    const dataSource = {
      transaction: jest.fn((cb: (m: unknown) => Promise<void>) => cb({})),
    };

    const useCase = new RecordManualActivityUseCase(
      activityRepo as any,
      receivableRepo as any,
      tenantContext as any,
      dataSource as any,
    );

    await expect(
      useCase.execute({
        receivableId: 'missing',
        activityType: CollectionActivityType.MANUAL_NOTE,
        description: 'x',
        createdByUserId: 'user-2',
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.RECEIVABLE_NOT_FOUND,
    } satisfies Partial<AppError>);
    expect(activityRepo.create).not.toHaveBeenCalled();
  });

  it('throws if activityType is not one of MANUAL_CALL/MANUAL_NOTE/PAYMENT_COMMITMENT', async () => {
    const receivableRepo = {
      findById: jest.fn().mockResolvedValue(buildReceivable()),
      findByIdForUpdate: jest.fn(),
      save: jest.fn(),
    };
    const activityRepo = {
      create: jest.fn(),
      findByReceivableId: jest.fn(),
      findByCustomerId: jest.fn(),
    };
    const tenantContext = { getOrganizationId: () => 'org-1' };
    const dataSource = {
      transaction: jest.fn((cb: (m: unknown) => Promise<void>) => cb({})),
    };

    const useCase = new RecordManualActivityUseCase(
      activityRepo as any,
      receivableRepo as any,
      tenantContext as any,
      dataSource as any,
    );

    await expect(
      useCase.execute({
        receivableId: 'rec-1',
        activityType: CollectionActivityType.PAYMENT_RECEIVED as any,
        description: 'x',
        createdByUserId: 'user-2',
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.VALIDATION_ERROR,
    } satisfies Partial<AppError>);
  });
});
