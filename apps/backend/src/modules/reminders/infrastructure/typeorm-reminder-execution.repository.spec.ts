import { ReminderSkipReason } from '../domain/reminder-execution';
import { TypeOrmReminderExecutionRepository } from './typeorm-reminder-execution.repository';

describe('TypeOrmReminderExecutionRepository.findPendingAutomatedBefore', () => {
  it('loads the oldest pending rule-based executions for the current tenant within the limit', async () => {
    const rows = [
      {
        id: 'execution-oldest',
        organizationId: 'org-current',
        receivableId: 'receivable-1',
        reminderRuleId: 'rule-1',
        minIntervalDays: 13,
        executionDate: '2026-10-08',
        sentAt: null,
        status: 'PENDING',
        skipReason: null,
        providerMessageId: null,
        failureReason: null,
        createdAt: new Date('2026-10-08T00:00:00.000Z'),
      },
    ];
    const queryBuilder = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(rows),
    };
    const createQueryBuilder = jest.fn().mockReturnValue(queryBuilder);
    const getRepository = jest.fn().mockReturnValue({ createQueryBuilder });
    const tenantContext = {
      getOrganizationId: jest.fn().mockReturnValue('org-current'),
    };
    const repo = new TypeOrmReminderExecutionRepository(
      { getRepository } as any,
      tenantContext as any,
    );
    const cutoff = new Date('2026-10-08T00:01:00.000Z');

    const result = await repo.findPendingAutomatedBefore(cutoff, 100);

    expect(tenantContext.getOrganizationId).toHaveBeenCalledTimes(1);
    expect(queryBuilder.where).toHaveBeenCalledWith(
      'e."organizationId" = :organizationId',
      { organizationId: 'org-current' },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('e.status = :pending', {
      pending: 'PENDING',
    });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'e."reminderRuleId" IS NOT NULL',
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'e."createdAt" <= :createdBefore',
      { createdBefore: cutoff },
    );
    expect(queryBuilder.orderBy).toHaveBeenCalledWith('e."createdAt"', 'ASC');
    expect(queryBuilder.take).toHaveBeenCalledWith(100);
    expect(result).toEqual([
      expect.objectContaining({ id: 'execution-oldest' }),
    ]);
    expect(result[0].executionDate).toEqual(
      new Date('2026-10-08T00:00:00.000Z'),
    );
    expect(result[0]).not.toBe(rows[0]);
    expect(result[0].minIntervalDays).toBe(13);
  });
});

describe('TypeOrmReminderExecutionRepository.findByKey', () => {
  it('loads the captured interval for a pending execution under the current tenant', async () => {
    const row = { id: 'execution-1', status: 'PENDING', minIntervalDays: 13 };
    const queryBuilder = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(row),
    };
    const getRepository = jest.fn().mockReturnValue({
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    });
    const repo = new TypeOrmReminderExecutionRepository(
      { getRepository } as any,
      { getOrganizationId: jest.fn().mockReturnValue('org-current') } as any,
    );

    const result = await repo.findByKey(
      'receivable-1',
      'rule-1',
      new Date('2026-10-08'),
    );

    expect(queryBuilder.select).toHaveBeenCalledWith([
      'e.id',
      'e.status',
      'e.minIntervalDays',
    ]);
    expect(result).toEqual({
      id: 'execution-1',
      status: 'PENDING',
      minIntervalDays: 13,
    });
  });
});

describe('TypeOrmReminderExecutionRepository.recoverMinIntervalDays', () => {
  it('reads the original rule under the current tenant and persists its interval on the pending execution', async () => {
    const readBuilder = {
      innerJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({
        capturedMinIntervalDays: null,
        ruleMinIntervalDays: 7,
      }),
    };
    const updateBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const repository = {
      createQueryBuilder: jest
        .fn()
        .mockReturnValueOnce(readBuilder)
        .mockReturnValueOnce(updateBuilder),
    };
    const tenantContext = {
      getOrganizationId: jest.fn().mockReturnValue('org-current'),
    };
    const repo = new TypeOrmReminderExecutionRepository(
      { getRepository: jest.fn().mockReturnValue(repository) } as any,
      tenantContext as any,
    );

    await expect(repo.recoverMinIntervalDays('execution-1')).resolves.toBe(7);

    expect(readBuilder.andWhere).toHaveBeenCalledWith(
      'e."organizationId" = :organizationId',
      { organizationId: 'org-current' },
    );
    expect(readBuilder.andWhere).toHaveBeenCalledWith('e.status = :pending', {
      pending: 'PENDING',
    });
    expect(readBuilder.innerJoin).toHaveBeenLastCalledWith(
      expect.any(Function),
      'p',
      expect.stringContaining('p."organizationId" = e."organizationId"::text'),
    );
    expect(updateBuilder.set).toHaveBeenCalledWith({ minIntervalDays: 7 });
    expect(updateBuilder.andWhere).toHaveBeenCalledWith(
      '"organizationId" = :organizationId',
      { organizationId: 'org-current' },
    );
    expect(updateBuilder.andWhere).toHaveBeenCalledWith(
      '"minIntervalDays" IS NULL',
    );
  });
});

describe('TypeOrmReminderExecutionRepository.findLatestSentByReceivableIds', () => {
  it('includes SENT history across rules and manual executions for the current tenant', async () => {
    const queryBuilder = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest
        .fn()
        .mockResolvedValue([
          { receivableId: 'receivable-1', sentAt: '2026-10-08T11:00:00.000Z' },
        ]),
    };
    const getRepository = jest.fn().mockReturnValue({
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    });
    const tenantContext = {
      getOrganizationId: jest.fn().mockReturnValue('org-current'),
    };
    const repo = new TypeOrmReminderExecutionRepository(
      { getRepository } as any,
      tenantContext as any,
    );

    const result = await repo.findLatestSentByReceivableIds(['receivable-1']);

    expect(queryBuilder.where).toHaveBeenCalledWith(
      'e."organizationId" = :organizationId',
      { organizationId: 'org-current' },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('e.status = :status', {
      status: 'SENT',
    });
    expect(
      queryBuilder.andWhere.mock.calls.some(([condition]) =>
        condition.includes('reminderRuleId'),
      ),
    ).toBe(false);
    expect(result.get('receivable-1')?.sentAt).toEqual(
      new Date('2026-10-08T11:00:00.000Z'),
    );
  });
});

describe('TypeOrmReminderExecutionRepository.markSkippedIfPending', () => {
  it('marks only the current tenant pending execution as skipped in a transaction', async () => {
    const queryBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const getRepository = jest.fn().mockReturnValue({
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    });
    const manager = { getRepository };
    const transaction = jest.fn(async (work) => await work(manager));
    const repo = new TypeOrmReminderExecutionRepository(
      { transaction } as any,
      { getOrganizationId: jest.fn().mockReturnValue('org-current') } as any,
    );

    await repo.markSkippedIfPending('execution-1', ReminderSkipReason.DISPUTED);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(queryBuilder.set).toHaveBeenCalledWith({
      status: 'SKIPPED',
      skipReason: 'DISPUTED',
      failureReason: null,
    });
    expect(queryBuilder.where).toHaveBeenCalledWith('id = :id', {
      id: 'execution-1',
    });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      '"organizationId" = :organizationId',
      { organizationId: 'org-current' },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('status = :pending', {
      pending: 'PENDING',
    });
  });
});

describe('TypeOrmReminderExecutionRepository.updateSendResult', () => {
  it('persists the supplied failure reason only while the tenant execution is pending', async () => {
    const queryBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const getRepository = jest.fn().mockReturnValue({
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    });
    const transaction = jest.fn(async (work) => await work({ getRepository }));
    const repo = new TypeOrmReminderExecutionRepository(
      { transaction } as any,
      { getOrganizationId: jest.fn().mockReturnValue('org-current') } as any,
    );

    await repo.updateSendResult(
      'execution-1',
      'FAILED',
      null,
      'Reminder rule was removed before delivery',
    );

    expect(queryBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'FAILED',
        providerMessageId: null,
        failureReason: 'Reminder rule was removed before delivery',
      }),
    );
    expect(queryBuilder.where).toHaveBeenCalledWith('id = :id', {
      id: 'execution-1',
    });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      '"organizationId" = :organizationId',
      { organizationId: 'org-current' },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('status = :pending', {
      pending: 'PENDING',
    });
  });
});

describe('TypeOrmReminderExecutionRepository.deleteOlderThan', () => {
  it('deletes rows older than the cutoff and returns the deleted count', async () => {
    const deleteMock = jest.fn().mockResolvedValue({ affected: 23 });
    const getRepository = jest.fn().mockReturnValue({ delete: deleteMock });
    const repo = new TypeOrmReminderExecutionRepository(
      { getRepository } as any,
      { getOrganizationId: jest.fn() } as any,
    );
    const cutoff = new Date('2026-01-01T00:00:00Z');

    const result = await repo.deleteOlderThan(cutoff);

    expect(deleteMock).toHaveBeenCalledWith({
      createdAt: expect.objectContaining({ _type: 'lessThan', _value: cutoff }),
    });
    expect(result).toBe(23);
  });
});
