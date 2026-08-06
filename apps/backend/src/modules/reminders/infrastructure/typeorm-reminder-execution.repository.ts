import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { IReminderExecutionRepository } from '../application/reminder-execution-repository.port';
import { ReminderExecutionStatus } from '../domain/reminder-execution';
import { ReminderExecutionOrmEntity } from './reminder-execution.orm-entity';

@Injectable()
export class TypeOrmReminderExecutionRepository
  implements IReminderExecutionRepository
{
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly tenantContext: TenantContextService,
  ) {}

  async getStatus(id: string): Promise<ReminderExecutionStatus | null> {
    const organizationId = this.tenantContext.getOrganizationId();
    const execution = await this.dataSource
      .getRepository(ReminderExecutionOrmEntity)
      .findOne({ select: { status: true }, where: { id, organizationId } });
    return execution?.status ?? null;
  }

  async updateSendResult(
    id: string,
    status: 'SENT' | 'FAILED',
    providerMessageId: string | null,
  ): Promise<void> {
    const organizationId = this.tenantContext.getOrganizationId();
    const nextStatus =
      status === 'SENT'
        ? ReminderExecutionStatus.SENT
        : ReminderExecutionStatus.FAILED;
    await this.dataSource.transaction(async (manager) => {
      await manager
        .getRepository(ReminderExecutionOrmEntity)
        .createQueryBuilder()
        .update()
        .set({
          status: nextStatus,
          providerMessageId,
          sentAt: status === ReminderExecutionStatus.SENT ? new Date() : null,
          failureReason:
            status === ReminderExecutionStatus.FAILED
              ? 'Email provider failed'
              : null,
          version: () => '"version" + 1',
        })
        .where('id = :id', { id })
        .andWhere('organizationId = :organizationId', { organizationId })
        .andWhere('status = :pending', {
          pending: ReminderExecutionStatus.PENDING,
        })
        .execute();
    });
  }
}
