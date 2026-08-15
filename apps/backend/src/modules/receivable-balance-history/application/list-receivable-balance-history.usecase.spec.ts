import { ReceivableStatus } from '@casso-ledger/shared-types';
import { Role } from '../../organizations/domain/membership';
import { BalanceHistoryActorType } from '../domain/balance-history-actor-type';
import { BalanceHistoryChangeSource } from '../domain/balance-history-change-source';
import { ListReceivableBalanceHistoryUseCase } from './list-receivable-balance-history.usecase';
import type { IReceivableBalanceHistoryQuery } from './receivable-balance-history-query.port';

describe('ListReceivableBalanceHistoryUseCase', () => {
  function buildUseCase(queryMock: jest.Mock) {
    const tenantContext = {
      getOrganizationId: () => 'org-1',
      getCurrentUser: () => ({
        userId: 'user-1',
        organizationId: 'org-1',
        role: Role.OWNER,
      }),
    };
    const useCase = new ListReceivableBalanceHistoryUseCase(
      { list: queryMock } as never as IReceivableBalanceHistoryQuery,
      tenantContext as never,
    );
    return useCase;
  }

  it('defaults to page 1 and limit 20 when omitted', async () => {
    const queryMock = jest.fn().mockResolvedValue({ items: [], total: 0 });
    const useCase = buildUseCase(queryMock);

    await useCase.execute({ filters: {} });

    expect(queryMock).toHaveBeenCalledWith(
      'org-1',
      {
        receivableId: undefined,
        from: undefined,
        to: undefined,
        status: undefined,
        changeSource: undefined,
        actorType: undefined,
      },
      1,
      20,
    );
  });

  it('caps the limit at 100', async () => {
    const queryMock = jest.fn().mockResolvedValue({ items: [], total: 0 });
    const useCase = buildUseCase(queryMock);

    await useCase.execute({ filters: {}, page: 3, limit: 500 });

    expect(queryMock).toHaveBeenCalledWith('org-1', expect.anything(), 3, 100);
  });

  it('converts local date filters to HCMC day boundaries', async () => {
    const queryMock = jest.fn().mockResolvedValue({ items: [], total: 0 });
    const useCase = buildUseCase(queryMock);

    await useCase.execute({
      filters: { from: '2026-08-01', to: '2026-08-10' },
    });

    const [, filters] = queryMock.mock.calls[0];
    expect(filters.from).toEqual(new Date('2026-07-31T17:00:00.000Z'));
    expect(filters.to).toEqual(new Date('2026-08-10T16:59:59.999Z'));
  });

  it('passes enum filters through to the query port', async () => {
    const queryMock = jest.fn().mockResolvedValue({ items: [], total: 0 });
    const useCase = buildUseCase(queryMock);

    await useCase.execute({
      filters: {
        receivableId: 'rec-1',
        status: ReceivableStatus.PAID,
        changeSource: BalanceHistoryChangeSource.ALLOCATE,
        actorType: BalanceHistoryActorType.WEBHOOK,
      },
    });

    const [, filters] = queryMock.mock.calls[0];
    expect(filters).toMatchObject({
      receivableId: 'rec-1',
      status: ReceivableStatus.PAID,
      changeSource: BalanceHistoryChangeSource.ALLOCATE,
      actorType: BalanceHistoryActorType.WEBHOOK,
    });
  });

  it('returns the paginated page from the query port', async () => {
    const page = { items: [{ id: 'h-1' }], total: 1 };
    const queryMock = jest.fn().mockResolvedValue(page);
    const useCase = buildUseCase(queryMock);

    await expect(useCase.execute({ filters: {} })).resolves.toEqual(page);
  });
});
