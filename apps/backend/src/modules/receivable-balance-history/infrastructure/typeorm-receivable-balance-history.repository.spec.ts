import { ReceivableStatus } from '@casso-ledger/shared-types';
import type { EntityManager, Repository } from 'typeorm';
import type { TenantContextService } from '../../../common/tenancy/tenant-context';
import { BalanceHistoryChangeSource } from '../domain/balance-history-change-source';
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
    changeReason: null,
    createdAt: new Date('2026-08-14T10:00:00.000Z'),
    ...overrides,
  };
}

describe('TypeOrmReceivableBalanceHistoryRepository', () => {
  function buildRepository(tenantId = 'org-1') {
    const ormRepo = {
      save: jest.fn().mockResolvedValue(undefined),
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
    return { repository, ormRepo, manager };
  }

  it('appends through the passed EntityManager', async () => {
    const { repository, ormRepo, manager } = buildRepository();
    const entry = buildEntry();

    await repository.append(entry, manager);

    expect(manager.getRepository).toHaveBeenCalledWith(
      ReceivableBalanceHistoryOrmEntity,
    );
    expect(ormRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'history-1',
        organizationId: 'org-1',
        receivableId: 'rec-1',
        status: ReceivableStatus.OPEN,
        remainingAmount: 10_000_000,
        changeSource: BalanceHistoryChangeSource.CREATE,
        changeReason: null,
      }),
    );
  });

  it('appends through the injected repository when no manager is passed', async () => {
    const { repository, ormRepo } = buildRepository();
    const saveMock = ormRepo.save as jest.Mock;

    await repository.append(buildEntry());

    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(saveMock.mock.calls[0]?.[0]).toMatchObject({
      receivableId: 'rec-1',
    });
  });

  it('rejects an entry for a different tenant', async () => {
    const { repository } = buildRepository('org-2');

    await expect(repository.append(buildEntry())).rejects.toThrow(
      'TENANT_MISMATCH',
    );
  });
});
