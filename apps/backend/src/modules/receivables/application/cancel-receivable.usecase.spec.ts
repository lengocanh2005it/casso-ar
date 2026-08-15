import { ReceivableStatus } from '@casso-ledger/shared-types';
import type { EntityManager } from 'typeorm';
import { ErrorCode } from '../../../common/errors/error-code';
import { Role } from '../../organizations/domain/membership';
import { BalanceHistoryActorType } from '../../receivable-balance-history/domain/balance-history-actor-type';
import { BalanceHistoryChangeSource } from '../../receivable-balance-history/domain/balance-history-change-source';
import { Receivable } from '../domain/receivable';
import { CancelReceivableUseCase } from './cancel-receivable.usecase';

function buildReceivable(
  paidAmount = 0,
  status = ReceivableStatus.OPEN,
): Receivable {
  return new Receivable({
    id: 'rec-1',
    organizationId: 'org-1',
    customerId: 'cust-1',
    invoiceId: null,
    originalAmount: 50_000_000,
    paidAmount,
    dueDate: new Date('2026-08-20'),
    status,
    salesRepresentativeId: 'user-1',
    createdAt: new Date('2026-07-20'),
    closedAt: null,
    version: 1,
  });
}

function buildDeps(receivable: Receivable | null) {
  const manager = {} as EntityManager;
  return {
    manager,
    receivableRepo: {
      findByIdForUpdate: jest.fn().mockResolvedValue(receivable),
      save: jest.fn(),
    },
    dataSource: {
      transaction: jest.fn(
        async (callback: (manager: EntityManager) => unknown) =>
          callback(manager),
      ),
    },
    auditContext: { setBefore: jest.fn() },
    eventPublisher: { emitAsync: jest.fn() },
    recorder: { record: jest.fn() },
    tenantContext: {
      getCurrentUser: () => ({
        userId: 'user-1',
        organizationId: 'org-1',
        role: Role.OWNER,
      }),
    },
  };
}

function buildUseCase(deps: ReturnType<typeof buildDeps>) {
  return new CancelReceivableUseCase(
    deps.receivableRepo as any,
    deps.dataSource as any,
    deps.auditContext as any,
    deps.eventPublisher as any,
    deps.recorder as any,
    deps.tenantContext as any,
  );
}

describe('CancelReceivableUseCase', () => {
  it('cancels an unpaid receivable and emits status-closed after commit', async () => {
    const deps = buildDeps(buildReceivable());
    const useCase = buildUseCase(deps);

    const result = await useCase.execute('rec-1');

    expect(result.status).toBe(ReceivableStatus.CANCELLED);
    expect(deps.receivableRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: ReceivableStatus.CANCELLED }),
      deps.manager,
    );
    expect(deps.eventPublisher.emitAsync).toHaveBeenCalledWith(
      'receivable.status-closed',
      { receivableId: 'rec-1', organizationId: 'org-1' },
    );
  });

  it('records the cancelled receivable balance history', async () => {
    const deps = buildDeps(buildReceivable());
    const useCase = buildUseCase(deps);

    await useCase.execute('rec-1');

    expect(deps.recorder.record).toHaveBeenCalledWith({
      receivable: expect.objectContaining({
        id: 'rec-1',
        status: ReceivableStatus.CANCELLED,
      }),
      changeSource: BalanceHistoryChangeSource.CANCEL,
      provenance: {
        actorType: BalanceHistoryActorType.USER,
        actorUserId: 'user-1',
      },
      manager: deps.manager,
    });
  });

  it('rejects a receivable that has received a payment', async () => {
    const deps = buildDeps(buildReceivable(10_000_000));
    const useCase = buildUseCase(deps);

    await expect(useCase.execute('rec-1')).rejects.toMatchObject({
      errorCode: ErrorCode.RECEIVABLE_HAS_PAYMENTS,
    });
    expect(deps.receivableRepo.save).not.toHaveBeenCalled();
    expect(deps.recorder.record).not.toHaveBeenCalled();
  });

  it('rejects a missing receivable', async () => {
    const deps = buildDeps(null);
    const useCase = buildUseCase(deps);

    await expect(useCase.execute('missing')).rejects.toMatchObject({
      errorCode: ErrorCode.RECEIVABLE_NOT_FOUND,
    });
  });

  it('rejects a receivable that is already closed', async () => {
    const deps = buildDeps(buildReceivable(0, ReceivableStatus.WRITTEN_OFF));
    const useCase = buildUseCase(deps);

    await expect(useCase.execute('rec-1')).rejects.toMatchObject({
      errorCode: ErrorCode.CONFLICT,
    });
    expect(deps.receivableRepo.save).not.toHaveBeenCalled();
    expect(deps.recorder.record).not.toHaveBeenCalled();
  });
});
