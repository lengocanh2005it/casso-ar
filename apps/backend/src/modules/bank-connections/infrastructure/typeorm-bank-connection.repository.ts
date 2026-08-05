import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, FindOptionsWhere, Repository } from 'typeorm';
import { BaseRepository } from '../../../common/tenancy/base.repository';
import type { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { IBankConnectionRepository } from '../application/bank-connection-repository.port';
import { BankConnection } from '../domain/bank-connection';
import { BankConnectionOrmEntity } from './bank-connection.orm-entity';

@Injectable()
export class TypeOrmBankConnectionRepository
  extends BaseRepository<BankConnectionOrmEntity>
  implements IBankConnectionRepository
{
  constructor(
    @InjectRepository(BankConnectionOrmEntity)
    repo: Repository<BankConnectionOrmEntity>,
    tenantContext: TenantContextService,
  ) {
    super(repo, tenantContext);
  }

  async findById(id: string): Promise<BankConnection | null> {
    const row = await this.scopedFindOne({
      id,
    } as FindOptionsWhere<BankConnectionOrmEntity>);
    return row ? new BankConnection(row) : null;
  }

  async findByIdForUpdate(
    id: string,
    manager: EntityManager,
  ): Promise<BankConnection | null> {
    const organizationId = this.tenantContext.getOrganizationId();
    const row = await manager.findOne(BankConnectionOrmEntity, {
      where: { id, organizationId },
      lock: { mode: 'pessimistic_write' },
    });
    return row ? new BankConnection(row) : null;
  }

  async findByIdUnscoped(id: string): Promise<BankConnection | null> {
    const row = await this.ormRepo.findOne({ where: { id } });
    return row ? new BankConnection(row) : null;
  }

  async save(
    connection: BankConnection,
    manager?: EntityManager,
  ): Promise<void> {
    await this.scopedSaveWithManager(
      connection as unknown as BankConnectionOrmEntity,
      manager,
      connection.organizationId,
    );
  }
}
