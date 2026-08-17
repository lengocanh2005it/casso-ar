import { ReceivableStatus } from '@casso-ledger/shared-types';
import type { EntityManager } from 'typeorm';
import type { AuthenticatedUser } from '../../../common/auth/authenticated-user';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { Role } from '../../organizations/domain/membership';
import { BalanceHistoryActorType } from '../../receivable-balance-history/domain/balance-history-actor-type';
import { BalanceHistoryChangeSource } from '../../receivable-balance-history/domain/balance-history-change-source';
import { Receivable } from '../domain/receivable';
import { ReceivableTransitionRunnerService } from './receivable-transition-runner.service';

function buildReceivable(
  status = ReceivableStatus.OPEN,
  paidAmount = 0,
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
      transaction: jest.fn(async (callback: (m: EntityManager) => unknown) =>
        callback(manager),
      ),
    },
    auditContext: { setBefore: jest.fn() },
    tenantContext: {
      getCurrentUser: jest.fn<AuthenticatedUser | undefined, []>(() => ({
        userId: 'user-1',
        organizationId: 'org-1',
        role: Role.OWNER,
      })),
    },
    eventPublisher: { emit: jest.fn() },
    recorder: { record: jest.fn() },
  };
}

function buildService(deps: ReturnType<typeof buildDeps>) {
  return new ReceivableTransitionRunnerService(
    deps.receivableRepo as any,
    deps.dataSource as any,
    deps.auditContext as any,
    deps.tenantContext as any,
    deps.eventPublisher as any,
    deps.recorder as any,
  );
}

describe('ReceivableTransitionRunnerService', () => {
  it('loads with a pessimistic lock, runs the transition, saves, records history and emits status-closed after commit', async () => {
    const receivable = buildReceivable();
    const deps = buildDeps(receivable);
    const service = buildService(deps);

    const result = await service.run({
      receivableId: 'rec-1',
      changeSource: BalanceHistoryChangeSource.WRITE_OFF,
      transition: (current) => current.writeOff(),
    });

    expect(deps.receivableRepo.findByIdForUpdate).toHaveBeenCalledWith(
      'rec-1',
      deps.manager,
    );
    expect(deps.receivableRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: ReceivableStatus.WRITTEN_OFF }),
      deps.manager,
    );
    expect(deps.auditContext.setBefore).toHaveBeenCalledWith(receivable);
    expect(deps.recorder.record).toHaveBeenCalledWith({
      receivable: expect.objectContaining({
        id: 'rec-1',
        status: ReceivableStatus.WRITTEN_OFF,
      }),
      changeSource: BalanceHistoryChangeSource.WRITE_OFF,
      provenance: {
        actorType: BalanceHistoryActorType.USER,
        actorUserId: 'user-1',
      },
      manager: deps.manager,
    });
    expect(deps.eventPublisher.emit).toHaveBeenCalledWith(
      'receivable.status-closed',
      { receivableId: 'rec-1', organizationId: 'org-1' },
    );
    expect(result.status).toBe(ReceivableStatus.WRITTEN_OFF);
  });

  it('throws RECEIVABLE_NOT_FOUND and skips transition, history and emission when the receivable is missing', async () => {
    const deps = buildDeps(null);
    const service = buildService(deps);
    const transition = jest.fn();

    await expect(
      service.run({
        receivableId: 'missing',
        changeSource: BalanceHistoryChangeSource.CANCEL,
        transition,
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.RECEIVABLE_NOT_FOUND });

    expect(transition).not.toHaveBeenCalled();
    expect(deps.auditContext.setBefore).not.toHaveBeenCalled();
    expect(deps.recorder.record).not.toHaveBeenCalled();
    expect(deps.eventPublisher.emit).not.toHaveBeenCalled();
  });

  it('throws UNAUTHORIZED when there is no current user (matching the previous save-then-check order)', async () => {
    const deps = buildDeps(buildReceivable());
    deps.tenantContext.getCurrentUser.mockReturnValue(undefined);
    const service = buildService(deps);

    await expect(
      service.run({
        receivableId: 'rec-1',
        changeSource: BalanceHistoryChangeSource.CANCEL,
        transition: (current) => current.cancel(),
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.UNAUTHORIZED });

    expect(deps.receivableRepo.save).toHaveBeenCalled();
    expect(deps.recorder.record).not.toHaveBeenCalled();
    expect(deps.eventPublisher.emit).not.toHaveBeenCalled();
  });

  it('runs assertTransitionAllowed before setBefore and the transition', async () => {
    const receivable = buildReceivable(ReceivableStatus.OPEN, 10_000_000);
    const deps = buildDeps(receivable);
    const service = buildService(deps);
    const assertTransitionAllowed = jest.fn(() => {
      throw new AppError(
        ErrorCode.RECEIVABLE_HAS_PAYMENTS,
        'Không thể hủy khoản phải thu đã nhận thanh toán.',
      );
    });
    const transition = jest.fn();

    await expect(
      service.run({
        receivableId: 'rec-1',
        changeSource: BalanceHistoryChangeSource.CANCEL,
        assertTransitionAllowed,
        transition,
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.RECEIVABLE_HAS_PAYMENTS });

    expect(assertTransitionAllowed).toHaveBeenCalledWith(receivable);
    expect(deps.auditContext.setBefore).not.toHaveBeenCalled();
    expect(transition).not.toHaveBeenCalled();
    expect(deps.receivableRepo.save).not.toHaveBeenCalled();
  });

  it('propagates an already-mapped transition error unchanged', async () => {
    const deps = buildDeps(buildReceivable());
    const service = buildService(deps);
    const mappedError = new AppError(ErrorCode.CONFLICT, 'already mapped');

    await expect(
      service.run({
        receivableId: 'rec-1',
        changeSource: BalanceHistoryChangeSource.CANCEL,
        transition: () => {
          throw mappedError;
        },
      }),
    ).rejects.toBe(mappedError);
    expect(deps.receivableRepo.save).not.toHaveBeenCalled();
    expect(deps.eventPublisher.emit).not.toHaveBeenCalled();
  });
});
