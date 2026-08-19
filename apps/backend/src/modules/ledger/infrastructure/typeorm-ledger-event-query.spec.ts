import { LedgerEventKind } from '../domain/ledger-event-kind';
import { LedgerEventSubjectType } from '../domain/ledger-event-subject-type';
import { TypeOrmLedgerEventQuery } from './typeorm-ledger-event-query';

describe('TypeOrmLedgerEventQuery', () => {
  it('scopes the query by organizationId, subjectType, and subjectId', async () => {
    const qb = {
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    const ormRepo = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
    const query = new TypeOrmLedgerEventQuery(ormRepo as never);

    await query.list(
      'org-1',
      { subjectType: LedgerEventSubjectType.RECEIVABLE, subjectId: 'r-1' },
      1,
      20,
    );

    expect(qb.andWhere).toHaveBeenCalledWith(
      'event.organizationId = :organizationId',
      { organizationId: 'org-1' },
    );
    expect(qb.andWhere).toHaveBeenCalledWith(
      'event.subjectType = :subjectType',
      { subjectType: LedgerEventSubjectType.RECEIVABLE },
    );
    expect(qb.andWhere).toHaveBeenCalledWith('event.subjectId = :subjectId', {
      subjectId: 'r-1',
    });
  });

  it('applies kind filter when provided', async () => {
    const qb = {
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    const ormRepo = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
    const query = new TypeOrmLedgerEventQuery(ormRepo as never);

    await query.list(
      'org-1',
      {
        subjectType: LedgerEventSubjectType.PAYMENT,
        subjectId: 'p-1',
        kind: LedgerEventKind.PAYMENT_RECEIVED,
      },
      1,
      20,
    );

    expect(qb.andWhere).toHaveBeenCalledWith('event.kind = :kind', {
      kind: LedgerEventKind.PAYMENT_RECEIVED,
    });
  });

  it('maps bigint amounts to numbers', async () => {
    const mockRow = {
      id: 'evt-1',
      organizationId: 'org-1',
      subjectType: LedgerEventSubjectType.RECEIVABLE,
      subjectId: 'r-1',
      kind: LedgerEventKind.RECEIVABLE_CREATED,
      amount: '500000',
      effectiveAt: new Date(),
      transitionReferenceId: null,
      createdAt: new Date(),
      sequence: 1,
    };
    const qb = {
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[mockRow], 1]),
    };
    const ormRepo = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
    const query = new TypeOrmLedgerEventQuery(ormRepo as never);

    const result = await query.list(
      'org-1',
      { subjectType: LedgerEventSubjectType.RECEIVABLE, subjectId: 'r-1' },
      1,
      20,
    );

    expect(result.items[0].amount).toBe(500000);
    expect(typeof result.items[0].amount).toBe('number');
  });
});
