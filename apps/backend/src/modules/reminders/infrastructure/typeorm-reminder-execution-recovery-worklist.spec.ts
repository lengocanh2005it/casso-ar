import type { DataSource } from 'typeorm';
import { ReminderExecutionStatus } from '../domain/reminder-execution';
import { TypeOrmReminderExecutionRecoveryWorklist } from './typeorm-reminder-execution-recovery-worklist';

describe('TypeOrmReminderExecutionRecoveryWorklist', () => {
  it('returns only organizations with stale automated pending executions', async () => {
    const createdBefore = new Date('2026-08-03T12:33:56.000Z');
    const queryBuilder = {
      select: jest.fn().mockReturnThis(),
      distinct: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getRawMany: jest
        .fn()
        .mockResolvedValue([
          { organizationId: 'org-1' },
          { organizationId: 'org-2' },
        ]),
    };
    const repository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };
    const dataSource = {
      getRepository: jest.fn().mockReturnValue(repository),
    };
    const worklist = new TypeOrmReminderExecutionRecoveryWorklist(
      dataSource as unknown as DataSource,
    );

    await expect(
      worklist.findOrganizationIdsWithStalePendingBefore(createdBefore),
    ).resolves.toEqual(['org-1', 'org-2']);

    expect(queryBuilder.select).toHaveBeenCalledWith(
      'execution.organizationId',
      'organizationId',
    );
    expect(queryBuilder.distinct).toHaveBeenCalledWith(true);
    expect(queryBuilder.where).toHaveBeenCalledWith(
      'execution.status = :pending',
      { pending: ReminderExecutionStatus.PENDING },
    );
    expect(queryBuilder.andWhere).toHaveBeenNthCalledWith(
      1,
      'execution."reminderRuleId" IS NOT NULL',
    );
    expect(queryBuilder.andWhere).toHaveBeenNthCalledWith(
      2,
      'execution."createdAt" <= :createdBefore',
      { createdBefore },
    );
    expect(queryBuilder.orderBy).toHaveBeenCalledWith(
      'execution."organizationId"',
      'ASC',
    );
  });
});
