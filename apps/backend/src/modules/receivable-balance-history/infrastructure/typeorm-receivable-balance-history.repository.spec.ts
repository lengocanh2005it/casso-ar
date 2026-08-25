import { ReceivableStatus } from '@casso-ar/shared-types';
import type { EntityManager, Repository } from 'typeorm';
import { ErrorCode } from '../../../common/errors/error-code';
import type { TenantContextService } from '../../../common/tenancy/tenant-context';
import { BalanceHistoryActorType } from '../domain/balance-history-actor-type';
import { BalanceHistoryChangeSource } from '../domain/balance-history-change-source';
import { BalanceHistoryReasonCode } from '../domain/balance-history-reason-code';
import type { ReceivableBalanceHistoryEntry } from '../domain/receivable-balance-history-entry';
import { ReceivableBalanceHistoryOrmEntity } from './receivable-balance-history.orm-entity';
import { TypeOrmReceivableBalanceHistoryRepository } from './typeorm-receivable-balance-history.repository';

function buildEntry(
  overrides: Partial<ReceivableBalanceHistoryEntry> = {},
): ReceivableBalanceHistoryEntry {
  return {
    id: 'history-1',
    organizationId: 'org-1',
    receivableId: 'rec-1',
    status: ReceivableStatus.OPEN,
    remainingAmount: 10_000_000,
    effectiveAt: new Date('2026-08-14T10:00:00.000Z'),
    changeSource: BalanceHistoryChangeSource.CREATE,
    reasonCode: null,
    actorType: null,
    actorUserId: null,
    note: null,
    transitionReferenceId: null,
    createdAt: new Date('2026-08-14T10:00:00.000Z'),
    ...overrides,
  };
}

describe('TypeOrmReceivableBalanceHistoryRepository', () => {
  function buildRepository(tenantId = 'org-1') {
    const insertMock = jest.fn().mockResolvedValue(undefined);
    const saveMock = jest.fn().mockResolvedValue(undefined);
    const ormRepo = {
      insert: insertMock,
      save: saveMock,
    } as never as Repository<ReceivableBalanceHistoryOrmEntity>;
    const manager = {
      getRepository: jest.fn().mockReturnValue(ormRepo),
    } as never as EntityManager;
    const tenantContext = {
      getOrganizationId: () => tenantId,
    } as never as TenantContextService;
    const repository = new TypeOrmReceivableBalanceHistoryRepository(
      ormRepo,
      tenantContext,
    );
    return { repository, ormRepo, insertMock, saveMock, manager };
  }

  it('inserts through the passed EntityManager', async () => {
    const { repository, ormRepo, insertMock, manager } = buildRepository();
    const entry = buildEntry();

    await repository.append(entry, manager);

    expect(manager.getRepository).toHaveBeenCalledWith(
      ReceivableBalanceHistoryOrmEntity,
    );
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'history-1',
        organizationId: 'org-1',
        receivableId: 'rec-1',
        status: ReceivableStatus.OPEN,
        remainingAmount: 10_000_000,
        changeSource: BalanceHistoryChangeSource.CREATE,
        actorType: null,
        actorUserId: null,
        reasonCode: null,
        note: null,
        transitionReferenceId: null,
      }),
    );
    expect(ormRepo.save).not.toHaveBeenCalled();
  });

  it('inserts through the injected repository when no manager is passed', async () => {
    const { repository, insertMock, saveMock } = buildRepository();

    await repository.append(buildEntry());

    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock.mock.calls[0]?.[0]).toMatchObject({
      receivableId: 'rec-1',
    });
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('carries the audit metadata through the explicit mapper', async () => {
    const { repository, insertMock } = buildRepository();

    await repository.append(
      buildEntry({
        changeSource: BalanceHistoryChangeSource.ALLOCATE,
        reasonCode: BalanceHistoryReasonCode.PAYMENT_ALLOCATED,
        actorType: BalanceHistoryActorType.WEBHOOK,
        actorUserId: null,
        note: 'Tự động phân bổ từ webhook',
        transitionReferenceId: 'alloc-9',
      }),
    );

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        changeSource: BalanceHistoryChangeSource.ALLOCATE,
        reasonCode: BalanceHistoryReasonCode.PAYMENT_ALLOCATED,
        actorType: BalanceHistoryActorType.WEBHOOK,
        actorUserId: null,
        note: 'Tự động phân bổ từ webhook',
        transitionReferenceId: 'alloc-9',
        changeReason: null,
      }),
    );
  });

  it('never updates an existing row: a duplicate id surfaces the insert conflict', async () => {
    const { repository, insertMock } = buildRepository();
    insertMock.mockRejectedValueOnce(
      new Error('duplicate key value violates unique constraint'),
    );

    // The append-only invariant is enforced by INSERT semantics: TypeORM's
    // save() would upsert an existing id, insert() cannot.
    await expect(
      repository.append(buildEntry({ id: 'history-1' })),
    ).rejects.toThrow('duplicate key value violates unique constraint');
    expect(insertMock).toHaveBeenCalledTimes(1);
  });

  it('rejects an entry for a different tenant', async () => {
    const { repository } = buildRepository('org-2');

    await expect(repository.append(buildEntry())).rejects.toMatchObject({
      errorCode: ErrorCode.TENANT_MISMATCH,
    });
  });
});
