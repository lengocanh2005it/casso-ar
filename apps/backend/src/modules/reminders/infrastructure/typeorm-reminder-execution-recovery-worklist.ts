import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { IReminderExecutionRecoveryWorklist } from '../application/reminder-execution-recovery-worklist.port';
import { ReminderExecutionStatus } from '../domain/reminder-execution';
import { ReminderExecutionOrmEntity } from './reminder-execution.orm-entity';

@Injectable()
export class TypeOrmReminderExecutionRecoveryWorklist
  implements IReminderExecutionRecoveryWorklist
{
  constructor(private readonly dataSource: DataSource) {}

  async findOrganizationIdsWithStalePendingBefore(
    createdBefore: Date,
  ): Promise<string[]> {
    const rows = await this.dataSource
      .getRepository(ReminderExecutionOrmEntity)
      .createQueryBuilder('execution')
      .select('execution.organizationId', 'organizationId')
      .distinct(true)
      .where('execution.status = :pending', {
        pending: ReminderExecutionStatus.PENDING,
      })
      .andWhere('execution."reminderRuleId" IS NOT NULL')
      .andWhere('execution."createdAt" <= :createdBefore', { createdBefore })
      .orderBy('execution."organizationId"', 'ASC')
      .getRawMany<{ organizationId: string }>();

    return rows.map((row) => row.organizationId);
  }
}
