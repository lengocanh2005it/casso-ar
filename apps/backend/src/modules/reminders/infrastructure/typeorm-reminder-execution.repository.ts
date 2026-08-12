import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { type DataSource, type EntityManager } from 'typeorm';
import { isUniqueViolation } from '../../../common/database/unique-violation';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { IReminderExecutionRepository } from '../application/reminder-execution-repository.port';
import {
  ReminderExecution,
  ReminderExecutionStatus,
} from '../domain/reminder-execution';
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

  async findLatestSent(receivableId: string): Promise<{ sentAt: Date } | null> {
    const organizationId = this.tenantContext.getOrganizationId();
    const row = await this.dataSource
      .getRepository(ReminderExecutionOrmEntity)
      .createQueryBuilder('e')
      .select(['e.id', 'e.sentAt'])
      .where('e."receivableId" = :receivableId', { receivableId })
      .andWhere('e."organizationId" = :organizationId', { organizationId })
      .andWhere('e.status = :status', {
        status: ReminderExecutionStatus.SENT,
      })
      .orderBy('e."sentAt"', 'DESC')
      .limit(1)
      .getOne();
    if (!row?.sentAt) return null;
    return { sentAt: row.sentAt };
  }

  async findByKey(
    receivableId: string,
    reminderRuleId: string | null,
    executionDate: Date,
  ): Promise<{ id: string; status: ReminderExecutionStatus } | null> {
    const organizationId = this.tenantContext.getOrganizationId();
    const row = await this.dataSource
      .getRepository(ReminderExecutionOrmEntity)
      .createQueryBuilder('e')
      .select(['e.id', 'e.status'])
      .where('e."receivableId" = :receivableId', { receivableId })
      .andWhere('e."organizationId" = :organizationId', { organizationId })
      .andWhere('e."reminderRuleId" IS NOT DISTINCT FROM :reminderRuleId', {
        reminderRuleId,
      })
      .andWhere('e."executionDate" = :executionDate', { executionDate })
      .getOne();
    return row ? { id: row.id, status: row.status } : null;
  }

  async findById(id: string): Promise<ReminderExecution | null> {
    const organizationId = this.tenantContext.getOrganizationId();
    const row = await this.dataSource
      .getRepository(ReminderExecutionOrmEntity)
      .findOne({ where: { id, organizationId } });
    return row ? new ReminderExecution(row) : null;
  }

  async insertIfAbsent(execution: ReminderExecution): Promise<boolean> {
    const organizationId = this.tenantContext.getOrganizationId();
    try {
      await this.dataSource.getRepository(ReminderExecutionOrmEntity).insert({
        id: execution.id,
        organizationId,
        receivableId: execution.receivableId,
        reminderRuleId: execution.reminderRuleId,
        executionDate: execution.executionDate,
        status: execution.status,
        skipReason: execution.skipReason,
        createdAt: new Date(),
      });
      return true;
    } catch (error) {
      if (isUniqueViolation(error)) {
        return false;
      }
      throw error;
    }
  }

  async save(
    execution: ReminderExecution,
    manager?: EntityManager,
  ): Promise<void> {
    const organizationId = this.tenantContext.getOrganizationId();
    await (manager ?? this.dataSource)
      .getRepository(ReminderExecutionOrmEntity)
      .save({
        id: execution.id,
        organizationId,
        receivableId: execution.receivableId,
        reminderRuleId: execution.reminderRuleId,
        executionDate: execution.executionDate,
        status: execution.status,
        skipReason: execution.skipReason,
        createdAt: execution.createdAt,
      });
  }

  async findPage(input: {
    receivableId?: string;
    status?: ReminderExecutionStatus;
    page: number;
    limit: number;
  }): Promise<{ items: ReminderExecution[]; total: number }> {
    const organizationId = this.tenantContext.getOrganizationId();
    const qb = this.dataSource
      .getRepository(ReminderExecutionOrmEntity)
      .createQueryBuilder('e')
      .where('e."organizationId" = :organizationId', { organizationId });

    if (input.receivableId) {
      qb.andWhere('e."receivableId" = :receivableId', {
        receivableId: input.receivableId,
      });
    }
    if (input.status) {
      qb.andWhere('e.status = :status', { status: input.status });
    }

    const [items, total] = await qb
      .orderBy('e."createdAt"', 'DESC')
      .skip((input.page - 1) * input.limit)
      .take(input.limit)
      .getManyAndCount();

    return {
      items: items.map((r) => new ReminderExecution(r)),
      total,
    };
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
          sentAt: status === 'SENT' ? new Date() : null,
          failureReason:
            status === 'FAILED'
              ? 'Email delivery failed after max attempts'
              : null,
        })
        .where('id = :id', { id })
        .andWhere('"organizationId" = :organizationId', { organizationId })
        .andWhere('status = :pending', {
          pending: ReminderExecutionStatus.PENDING,
        })
        .execute();
    });
  }
}
