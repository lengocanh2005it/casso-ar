import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import { BaseRepository } from '../../../common/tenancy/base.repository';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { ICassoFlowAuthorizationRepository } from '../application/casso-flow-authorization-repository.port';
import { CassoFlowAuthorization } from '../domain/casso-flow-authorization';
import { CassoFlowAuthorizationOrmEntity } from './casso-flow-authorization.orm-entity';

@Injectable()
export class TypeOrmCassoFlowAuthorizationRepository
  extends BaseRepository<CassoFlowAuthorizationOrmEntity>
  implements ICassoFlowAuthorizationRepository
{
  constructor(
    @InjectRepository(CassoFlowAuthorizationOrmEntity)
    repo: Repository<CassoFlowAuthorizationOrmEntity>,
    tenantContext: TenantContextService,
  ) {
    super(repo, tenantContext);
  }

  async findByIdUnscoped(id: string): Promise<CassoFlowAuthorization | null> {
    const row = await this.ormRepo.findOne({ where: { id } });
    return row ? new CassoFlowAuthorization(row) : null;
  }

  async findById(id: string): Promise<CassoFlowAuthorization | null> {
    const organizationId = this.tenantContext.getOrganizationId();
    const row = await this.ormRepo.findOne({
      where: { id, organizationId },
    });
    return row ? new CassoFlowAuthorization(row) : null;
  }

  async findByIdForUpdate(
    id: string,
    manager: EntityManager,
  ): Promise<CassoFlowAuthorization | null> {
    const organizationId = this.tenantContext.getOrganizationId();
    const row = await manager.findOne(CassoFlowAuthorizationOrmEntity, {
      where: { id, organizationId },
      lock: { mode: 'pessimistic_write' },
    });
    return row ? new CassoFlowAuthorization(row) : null;
  }

  async findByBusinessIdForOrganization(
    businessId: string,
    organizationId: string,
  ): Promise<CassoFlowAuthorization | null> {
    const row = await this.ormRepo.findOne({
      where: { businessId, organizationId },
    });
    return row ? new CassoFlowAuthorization(row) : null;
  }

  async save(
    authorization: CassoFlowAuthorization,
    manager?: EntityManager,
  ): Promise<void> {
    await this.scopedSaveWithManager(
      authorization,
      manager,
      authorization.organizationId,
    );
  }
}
