import { ReceivableStatus } from '@casso-ledger/shared-types';
import { ErrorCode } from '../../../common/errors/error-code';
import { Receivable } from '../../receivables/domain/receivable';
import { DisputeStatus } from '../domain/dispute';
import { OpenDisputeUseCase } from './open-dispute.usecase';

function buildReceivable(): Receivable {
  return new Receivable({
    id: 'receivable-1',
    organizationId: 'org-1',
    customerId: 'customer-1',
    invoiceId: null,
    originalAmount: 50_000_000,
    paidAmount: 0,
    dueDate: new Date('2026-08-20'),
    status: ReceivableStatus.OPEN,
    salesRepresentativeId: null,
    createdAt: new Date('2026-07-20'),
    closedAt: null,
    version: 1,
  });
}

describe('OpenDisputeUseCase', () => {
  it('opens a dispute in a transaction without changing the receivable', async () => {
    const receivable = buildReceivable();
    const manager = {};
    const dataSource = {
      transaction: jest.fn(async (callback: (manager: object) => unknown) =>
        callback(manager),
      ),
    };
    const receivableRepo = {
      findByIdForUpdate: jest.fn().mockResolvedValue(receivable),
    };
    const disputeRepo = {
      findOpenDispute: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const tenantContext = { getOrganizationId: () => 'org-1' };
    const eventPublisher = { emit: jest.fn() };

    const useCase = new OpenDisputeUseCase(
      disputeRepo as any,
      receivableRepo as any,
      dataSource as any,
      tenantContext as any,
      eventPublisher as any,
    );

    const result = await useCase.execute({
      receivableId: 'receivable-1',
      reason: 'Số tiền trên hóa đơn không khớp.',
      openedByUserId: 'user-2',
    });

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(DisputeStatus.OPEN);
    expect(receivable.status).toBe(ReceivableStatus.OPEN);
    expect(receivableRepo.findByIdForUpdate).toHaveBeenCalledWith(
      'receivable-1',
      manager,
    );
    expect(disputeRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        receivableId: 'receivable-1',
        status: DisputeStatus.OPEN,
        openedByUserId: 'user-2',
      }),
      manager,
    );
    expect(eventPublisher.emit).toHaveBeenCalledWith('dispute.opened', {
      disputeId: result.id,
      receivableId: 'receivable-1',
      organizationId: 'org-1',
    });
  });

  it('rejects a second open dispute for the same receivable', async () => {
    const dataSource = {
      transaction: jest.fn(async (callback: (manager: object) => unknown) =>
        callback({}),
      ),
    };
    const disputeRepo = {
      findOpenDispute: jest.fn().mockResolvedValue({ id: 'existing' }),
      save: jest.fn(),
    };
    const useCase = new OpenDisputeUseCase(
      disputeRepo as any,
      {
        findByIdForUpdate: jest.fn().mockResolvedValue(buildReceivable()),
      } as any,
      dataSource as any,
      { getOrganizationId: () => 'org-1' } as any,
      { emit: jest.fn() } as any,
    );

    await expect(
      useCase.execute({
        receivableId: 'receivable-1',
        reason: 'Tranh chấp thứ hai.',
        openedByUserId: 'user-2',
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.DISPUTE_ALREADY_OPEN });
    expect(disputeRepo.save).not.toHaveBeenCalled();
  });

  it('rejects when the receivable is not found', async () => {
    const dataSource = {
      transaction: jest.fn(async (callback: (manager: object) => unknown) =>
        callback({}),
      ),
    };
    const eventPublisher = { emit: jest.fn() };
    const useCase = new OpenDisputeUseCase(
      { findOpenDispute: jest.fn(), save: jest.fn() } as any,
      { findByIdForUpdate: jest.fn().mockResolvedValue(null) } as any,
      dataSource as any,
      { getOrganizationId: () => 'org-1' } as any,
      eventPublisher as any,
    );

    await expect(
      useCase.execute({
        receivableId: 'missing',
        reason: 'Không tìm thấy.',
        openedByUserId: 'user-2',
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.RECEIVABLE_NOT_FOUND });
    expect(eventPublisher.emit).not.toHaveBeenCalled();
  });
});
