import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type EntityManager, In, type Repository } from 'typeorm';
import { BaseRepository } from '../../../common/tenancy/base.repository';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { IConnectionAuditEventRepository } from '../application/connection-audit-event-repository.port';
import {
  ConnectionAuditEvent,
  type ConnectionAuditEventType,
} from '../domain/connection-audit-event';
import { ConnectionAuditEventOrmEntity } from './connection-audit-event.orm-entity';

@Injectable()
export class TypeOrmConnectionAuditEventRepository
  extends BaseRepository<ConnectionAuditEventOrmEntity>
  implements IConnectionAuditEventRepository
{
  constructor(
    @InjectRepository(ConnectionAuditEventOrmEntity)
    repo: Repository<ConnectionAuditEventOrmEntity>,
    tenantContext: TenantContextService,
  ) {
    super(repo, tenantContext);
  }

  // organizationId always comes from the event itself (already resolved by
  // the caller, which may be a background job with no TenantContextService)
  // rather than from ambient tenant context — see bank-connection-repository.port.ts.
  async save(
    event: ConnectionAuditEvent,
    manager?: EntityManager,
  ): Promise<void> {
    await this.scopedSaveWithManager(event, manager, event.organizationId);
  }

  // Unscoped by organizationId on purpose, same reasoning as
  // findByAuthorizationId on the bank connection repository: the caller
  // (ListAuthorizationAuditEventsUseCase) has already verified the
  // authorization — and therefore every bankConnectionId passed in — belongs
  // to the caller's organization.
  async findByBankConnectionIds(
    bankConnectionIds: string[],
    eventTypes: ConnectionAuditEventType[],
    page: number,
    limit: number,
  ): Promise<{ items: ConnectionAuditEvent[]; total: number }> {
    if (bankConnectionIds.length === 0) return { items: [], total: 0 };
    const [rows, total] = await this.ormRepo.findAndCount({
      where: {
        bankConnectionId: In(bankConnectionIds),
        eventType: In(eventTypes),
      },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      items: rows.map((row) => new ConnectionAuditEvent(row)),
      total,
    };
  }
}
