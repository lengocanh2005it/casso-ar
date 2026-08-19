import { LedgerEventSubjectType } from '../domain/ledger-event-subject-type';
import { ListLedgerEventsUseCase } from './list-ledger-events.usecase';

describe('ListLedgerEventsUseCase', () => {
  it('clamps limit to 100 and defaults page to 1', async () => {
    const query = {
      list: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    };
    const tenantContext = { getOrganizationId: () => 'org-1' } as never;
    const useCase = new ListLedgerEventsUseCase(query as never, tenantContext);

    await useCase.execute({
      filters: {
        subjectType: LedgerEventSubjectType.RECEIVABLE,
        subjectId: 'r-1',
      },
      limit: 500,
    });

    expect(query.list).toHaveBeenCalledWith(
      'org-1',
      { subjectType: LedgerEventSubjectType.RECEIVABLE, subjectId: 'r-1' },
      1,
      100,
    );
  });

  it('clamps negative page to 1', async () => {
    const query = {
      list: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    };
    const tenantContext = { getOrganizationId: () => 'org-1' } as never;
    const useCase = new ListLedgerEventsUseCase(query as never, tenantContext);

    await useCase.execute({
      filters: {
        subjectType: LedgerEventSubjectType.PAYMENT,
        subjectId: 'p-1',
      },
      page: -5,
    });

    expect(query.list).toHaveBeenCalledWith(
      'org-1',
      { subjectType: LedgerEventSubjectType.PAYMENT, subjectId: 'p-1' },
      1,
      20,
    );
  });

  it('passes through valid page and limit', async () => {
    const query = {
      list: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    };
    const tenantContext = { getOrganizationId: () => 'org-1' } as never;
    const useCase = new ListLedgerEventsUseCase(query as never, tenantContext);

    await useCase.execute({
      filters: {
        subjectType: LedgerEventSubjectType.RECEIVABLE,
        subjectId: 'r-1',
      },
      page: 3,
      limit: 50,
    });

    expect(query.list).toHaveBeenCalledWith(
      'org-1',
      { subjectType: LedgerEventSubjectType.RECEIVABLE, subjectId: 'r-1' },
      3,
      50,
    );
  });
});
