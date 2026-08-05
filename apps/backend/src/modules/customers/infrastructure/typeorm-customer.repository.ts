import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, FindOptionsWhere, Repository } from 'typeorm';
import { BaseRepository } from '../../../common/tenancy/base.repository';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { ICustomerRepository } from '../application/customer-repository.port';
import type { Customer } from '../domain/customer';
import { CustomerOrmEntity } from './customer.orm-entity';

@Injectable()
export class TypeOrmCustomerRepository
  extends BaseRepository<CustomerOrmEntity>
  implements ICustomerRepository
{
  constructor(
    @InjectRepository(CustomerOrmEntity)
    repo: Repository<CustomerOrmEntity>,
    tenantContext: TenantContextService,
  ) {
    super(repo, tenantContext);
  }

  async findById(id: string): Promise<Customer | null> {
    return this.scopedFindOne({
      id,
    } as FindOptionsWhere<CustomerOrmEntity>);
  }

  async save(customer: Customer, manager?: EntityManager): Promise<void> {
    await this.scopedSaveWithManager(customer as CustomerOrmEntity, manager);
  }
}
