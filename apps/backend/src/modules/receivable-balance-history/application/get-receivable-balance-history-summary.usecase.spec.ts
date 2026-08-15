import { ReceivableStatus } from '@casso-ledger/shared-types';
import { Role } from '../../organizations/domain/membership';
import { BalanceHistoryActorType } from '../domain/balance-history-actor-type';
import { BalanceHistoryChangeSource } from '../domain/balance-history-change-source';
import { GetReceivableBalanceHistorySummaryUseCase } from './get-receivable-balance-history-summary.usecase';
import type { IReceivableBalanceHistoryQuery } from './receivable-balance-history-query.port';

describe('GetReceivableBalanceHistorySummaryUseCase', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  function buildUseCase(queryMock: jest.Mock) {
    const tenantContext = {
      getOrganizationId: () => 'org-1',
      getCurrentUser: () => ({
        userId: 'user-1',
        organizationId: 'org-1',
        role: Role.OWNER,
      }),
    };
    const useCase = new GetReceivableBalanceHistorySummaryUseCase(
      { summarize: queryMock } as never as IReceivableBalanceHistoryQuery,
      tenantContext as never,
    );
    return useCase;
  }

  it('defaults to the latest 30 HCMC calendar days when both dates are omitted', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-15T04:00:00.000Z'));
    const queryMock = jest.fn().mockResolvedValue({});
    const useCase = buildUseCase(queryMock);

    await useCase.execute({ filters: {} });

    const [, filters] = queryMock.mock.calls[0];
    expect(filters.from).toEqual(new Date('2026-07-16T17:00:00.000Z'));
    expect(filters.to).toEqual(new Date('2026-08-15T16:59:59.999Z'));
  });

  it('uses explicit inclusive HCMC day boundaries when both dates are given', async () => {
    const queryMock = jest.fn().mockResolvedValue({});
    const useCase = buildUseCase(queryMock);

    await useCase.execute({
      filters: { from: '2026-08-01', to: '2026-08-31' },
    });

    const [, filters] = queryMock.mock.calls[0];
    expect(filters.from).toEqual(new Date('2026-07-31T17:00:00.000Z'));
    expect(filters.to).toEqual(new Date('2026-08-31T16:59:59.999Z'));
  });

  it('keeps an unbounded edge when only one date is supplied', async () => {
    const queryMock = jest.fn().mockResolvedValue({});
    const useCase = buildUseCase(queryMock);

    await useCase.execute({ filters: { from: '2026-08-01' } });
    expect(queryMock.mock.calls[0][1]).toMatchObject({
      from: new Date('2026-07-31T17:00:00.000Z'),
      to: undefined,
    });

    await useCase.execute({ filters: { to: '2026-08-31' } });
    expect(queryMock.mock.calls[1][1]).toMatchObject({
      from: undefined,
      to: new Date('2026-08-31T16:59:59.999Z'),
    });
  });

  it('passes enum and receivable filters through', async () => {
    const queryMock = jest.fn().mockResolvedValue({});
    const useCase = buildUseCase(queryMock);

    await useCase.execute({
      filters: {
        receivableId: 'rec-1',
        status: ReceivableStatus.OPEN,
        changeSource: BalanceHistoryChangeSource.CREATE,
        actorType: BalanceHistoryActorType.USER,
      },
    });

    expect(queryMock.mock.calls[0][1]).toMatchObject({
      receivableId: 'rec-1',
      status: ReceivableStatus.OPEN,
      changeSource: BalanceHistoryChangeSource.CREATE,
      actorType: BalanceHistoryActorType.USER,
    });
  });

  it('returns the summary from the query port', async () => {
    const summary = { totalTransitions: 3, latestRemainingAmount: 0 };
    const queryMock = jest.fn().mockResolvedValue(summary);
    const useCase = buildUseCase(queryMock);

    await expect(
      useCase.execute({ filters: { from: '2026-08-01', to: '2026-08-31' } }),
    ).resolves.toEqual(summary);
  });
});
