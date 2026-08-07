import { ErrorCode } from '../../../common/errors/error-code';
import { Dispute, DisputeStatus } from '../domain/dispute';
import { ResolveDisputeUseCase } from './resolve-dispute.usecase';

function buildOpenDispute(): Dispute {
  return new Dispute({
    id: 'dispute-1',
    organizationId: 'org-1',
    receivableId: 'receivable-1',
    reason: 'Số tiền không khớp.',
    status: DisputeStatus.OPEN,
    openedByUserId: 'user-1',
    resolvedByUserId: null,
    resolvedAt: null,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    version: 1,
  });
}

describe('ResolveDisputeUseCase', () => {
  it('resolves an open dispute in a transaction and emits an event after save', async () => {
    const dispute = buildOpenDispute();
    const manager = {};
    const dataSource = {
      transaction: jest.fn(async (callback: (manager: object) => unknown) =>
        callback(manager),
      ),
    };
    const disputeRepo = {
      findByIdForUpdate: jest.fn().mockResolvedValue(dispute),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const tenantContext = { getOrganizationId: () => 'org-1' };
    const eventPublisher = { emit: jest.fn() };

    const useCase = new ResolveDisputeUseCase(
      disputeRepo as any,
      dataSource as any,
      tenantContext as any,
      eventPublisher as any,
    );

    const result = await useCase.execute({
      disputeId: 'dispute-1',
      resolvedByUserId: 'user-2',
    });

    expect(result.status).toBe(DisputeStatus.RESOLVED);
    expect(disputeRepo.findByIdForUpdate).toHaveBeenCalledWith(
      'dispute-1',
      manager,
    );
    expect(disputeRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: DisputeStatus.RESOLVED,
        resolvedByUserId: 'user-2',
      }),
      manager,
    );
    expect(eventPublisher.emit).toHaveBeenCalledWith('dispute.resolved', {
      disputeId: 'dispute-1',
      receivableId: 'receivable-1',
      organizationId: 'org-1',
    });
  });

  it('rejects when the dispute is not found', async () => {
    const dataSource = {
      transaction: jest.fn(async (callback: (manager: object) => unknown) =>
        callback({}),
      ),
    };
    const useCase = new ResolveDisputeUseCase(
      { findByIdForUpdate: jest.fn().mockResolvedValue(null) } as any,
      dataSource as any,
      { getOrganizationId: () => 'org-1' } as any,
      { emit: jest.fn() } as any,
    );

    await expect(
      useCase.execute({ disputeId: 'missing', resolvedByUserId: 'user-2' }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.NOT_FOUND });
  });

  it('rejects resolving an already resolved dispute as a conflict', async () => {
    const resolved = buildOpenDispute().resolve('user-2');
    const dataSource = {
      transaction: jest.fn(async (callback: (manager: object) => unknown) =>
        callback({}),
      ),
    };
    const disputeRepo = {
      findByIdForUpdate: jest.fn().mockResolvedValue(resolved),
      save: jest.fn(),
    };
    const useCase = new ResolveDisputeUseCase(
      disputeRepo as any,
      dataSource as any,
      { getOrganizationId: () => 'org-1' } as any,
      { emit: jest.fn() } as any,
    );

    await expect(
      useCase.execute({ disputeId: 'dispute-1', resolvedByUserId: 'user-3' }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.CONFLICT });
    expect(disputeRepo.save).not.toHaveBeenCalled();
  });
});
