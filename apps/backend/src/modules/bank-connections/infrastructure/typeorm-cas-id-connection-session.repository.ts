import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, FindOptionsWhere, Repository } from 'typeorm';
import { BaseRepository } from '../../../common/tenancy/base.repository';
import type { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { ICasIdConnectionSessionRepository } from '../application/cas-id-connection-session-repository.port';
import { CasIdConnectionSession } from '../domain/cas-id-connection-session';
import { CasIdConnectionSessionOrmEntity } from './cas-id-connection-session.orm-entity';

@Injectable()
export class TypeOrmCasIdConnectionSessionRepository
  extends BaseRepository<CasIdConnectionSessionOrmEntity>
  implements ICasIdConnectionSessionRepository
{
  constructor(
    @InjectRepository(CasIdConnectionSessionOrmEntity)
    repo: Repository<CasIdConnectionSessionOrmEntity>,
    tenantContext: TenantContextService,
  ) {
    super(repo, tenantContext);
  }

  async findById(id: string): Promise<CasIdConnectionSession | null> {
    const row = await this.scopedFindOne({
      id,
    } as FindOptionsWhere<CasIdConnectionSessionOrmEntity>);
    return row ? new CasIdConnectionSession(row) : null;
  }

  async findByIdForUpdate(
    id: string,
    manager: EntityManager,
  ): Promise<CasIdConnectionSession | null> {
    const organizationId = this.tenantContext.getOrganizationId();
    const row = await manager.findOne(CasIdConnectionSessionOrmEntity, {
      where: { id, organizationId },
      lock: { mode: 'pessimistic_write' },
    });
    return row ? new CasIdConnectionSession(row) : null;
  }

  async save(
    session: CasIdConnectionSession,
    manager?: EntityManager,
  ): Promise<void> {
    await this.scopedSaveWithManager(
      session as unknown as CasIdConnectionSessionOrmEntity,
      manager,
      session.organizationId,
    );
  }
}
