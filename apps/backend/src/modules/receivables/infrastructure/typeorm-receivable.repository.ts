import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, FindOptionsWhere, Repository } from 'typeorm';
import { BaseRepository } from '../../../common/tenancy/base.repository';
// biome-ignore lint/style/useImportType: must be a value import — NestJS DI resolves this constructor param via emitDecoratorMetadata's design:paramtypes, which erases type-only imports to `Function`
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { IReceivableRepository } from '../application/receivable-repository.port';
import { Receivable } from '../domain/receivable';
import { ReceivableOrmEntity } from './receivable.orm-entity';

@Injectable()
export class TypeOrmReceivableRepository
  extends BaseRepository<ReceivableOrmEntity>
  implements IReceivableRepository
{
  constructor(
    @InjectRepository(ReceivableOrmEntity)
    repo: Repository<ReceivableOrmEntity>,
    tenantContext: TenantContextService,
  ) {
    super(repo, tenantContext);
  }

  async findById(id: string): Promise<Receivable | null> {
    const row = await this.scopedFindOne({
      id,
    } as FindOptionsWhere<ReceivableOrmEntity>);
    return row ? new Receivable(row) : null;
  }

  async findByIdForUpdate(
    id: string,
    manager: EntityManager,
  ): Promise<Receivable | null> {
    const organizationId = this.tenantContext.getOrganizationId();
    const row = await manager.findOne(ReceivableOrmEntity, {
      where: { id, organizationId },
      lock: { mode: 'pessimistic_write' },
    });
    return row ? new Receivable(row) : null;
  }

  async save(receivable: Receivable, manager?: EntityManager): Promise<void> {
    await this.scopedSaveWithManager(
      receivable as unknown as ReceivableOrmEntity,
      manager,
    );
  }
}
