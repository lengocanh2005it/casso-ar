import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseRepository } from '../../../common/tenancy/base.repository';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type {
  CopilotPendingAction,
  ICopilotPendingActionRepository,
  SendReminderEmailPayload,
} from '../application/pending-action-repository.port';
import { CopilotPendingActionOrmEntity } from './copilot-pending-action.orm-entity';

function toDomain(row: CopilotPendingActionOrmEntity): CopilotPendingAction {
  return {
    id: row.id,
    organizationId: row.organizationId,
    conversationId: row.conversationId,
    actionType: row.actionType,
    payload: row.payload,
    status: row.status,
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
    resolvedByUserId: row.resolvedByUserId,
  };
}

@Injectable()
export class TypeOrmCopilotPendingActionRepository
  extends BaseRepository<CopilotPendingActionOrmEntity>
  implements ICopilotPendingActionRepository
{
  constructor(
    @InjectRepository(CopilotPendingActionOrmEntity)
    repo: Repository<CopilotPendingActionOrmEntity>,
    tenantContext: TenantContextService,
  ) {
    super(repo, tenantContext);
  }

  async create(
    conversationId: string,
    payload: SendReminderEmailPayload,
  ): Promise<CopilotPendingAction> {
    const row = await this.ormRepo.save({
      id: randomUUID(),
      organizationId: this.tenantContext.getOrganizationId(),
      conversationId,
      actionType: 'SEND_REMINDER_EMAIL' as const,
      payload,
      status: 'PENDING' as const,
      createdAt: new Date(),
      resolvedAt: null,
      resolvedByUserId: null,
    });
    return toDomain(row);
  }

  async findById(id: string): Promise<CopilotPendingAction | null> {
    const row = await this.scopedFindOne({ id });
    return row ? toDomain(row) : null;
  }

  async markExpired(id: string): Promise<void> {
    const organizationId = this.tenantContext.getOrganizationId();
    await this.ormRepo
      .createQueryBuilder()
      .update(CopilotPendingActionOrmEntity)
      .set({ status: 'EXPIRED', resolvedAt: new Date() })
      .where('id = :id', { id })
      .andWhere('"organizationId" = :organizationId', { organizationId })
      .andWhere('status IN (:...statuses)', {
        statuses: ['PENDING', 'CONFIRMED', 'CANCELLED'],
      })
      .execute();
  }

  confirmIfPending(
    id: string,
    resolvedByUserId: string,
  ): Promise<CopilotPendingAction | null> {
    return this.resolveIfPending(id, resolvedByUserId, 'CONFIRMED');
  }

  cancelIfPending(
    id: string,
    resolvedByUserId: string,
  ): Promise<CopilotPendingAction | null> {
    return this.resolveIfPending(id, resolvedByUserId, 'CANCELLED');
  }

  private async resolveIfPending(
    id: string,
    resolvedByUserId: string,
    status: 'CONFIRMED' | 'CANCELLED',
  ): Promise<CopilotPendingAction | null> {
    const organizationId = this.tenantContext.getOrganizationId();
    const result = await this.ormRepo
      .createQueryBuilder()
      .update(CopilotPendingActionOrmEntity)
      .set({ status, resolvedAt: new Date(), resolvedByUserId })
      .where('id = :id', { id })
      .andWhere('"organizationId" = :organizationId', { organizationId })
      .andWhere('status = :status', { status: 'PENDING' })
      .returning('*')
      .execute();
    const row = result.raw[0] as CopilotPendingActionOrmEntity | undefined;
    return row ? toDomain(row) : null;
  }
}
