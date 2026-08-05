import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import { BaseRepository } from '../../../common/tenancy/base.repository';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { IConnectionAuditEventRepository } from '../application/connection-audit-event-repository.port';
import type { ConnectionAuditEvent } from '../domain/connection-audit-event';
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
}
