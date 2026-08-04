import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import type { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { IReceivableRepository } from '../application/receivable-repository.port';
import { Receivable } from '../domain/receivable';
import { ReceivableOrmEntity } from './receivable.orm-entity';

@Injectable()
export class TypeOrmReceivableRepository implements IReceivableRepository {
  constructor(
    @InjectRepository(ReceivableOrmEntity)
    private readonly repo: Repository<ReceivableOrmEntity>,
    private readonly tenantContext: TenantContextService,
  ) {}

  async findById(id: string): Promise<Receivable | null> {
    const row = await this.repo.findOne({
      where: { id, organizationId: this.tenantContext.getOrganizationId() },
    });
    return row ? new Receivable(row) : null;
  }

  async findByIdForUpdate(
    id: string,
    manager: EntityManager,
  ): Promise<Receivable | null> {
    const row = await manager.findOne(ReceivableOrmEntity, {
      where: { id, organizationId: this.tenantContext.getOrganizationId() },
      lock: { mode: 'pessimistic_write' },
    });
    return row ? new Receivable(row) : null;
  }

  async save(receivable: Receivable, manager?: EntityManager): Promise<void> {
    const repo = manager
      ? manager.getRepository(ReceivableOrmEntity)
      : this.repo;
    await repo.save({
      ...receivable,
      organizationId: this.tenantContext.getOrganizationId(),
    } as ReceivableOrmEntity);
  }
}
