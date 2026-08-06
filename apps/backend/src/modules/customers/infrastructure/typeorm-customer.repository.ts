import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, FindOptionsWhere, Repository } from 'typeorm';
import { BaseRepository } from '../../../common/tenancy/base.repository';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { ICustomerRepository } from '../application/customer-repository.port';
import type { Customer } from '../domain/customer';
import { CustomerOrmEntity } from './customer.orm-entity';

// Explicit domain → ORM translation: the compiler checks every field, so a
// drift between the two shapes fails here instead of being cast away.
function toOrm(customer: Customer): CustomerOrmEntity {
  return {
    id: customer.id,
    organizationId: customer.organizationId,
    name: customer.name,
    taxCode: customer.taxCode,
    email: customer.email,
    phone: customer.phone,
    defaultPaymentTermDays: customer.defaultPaymentTermDays,
    creditLimit: customer.creditLimit,
    priority: customer.priority,
    createdAt: customer.createdAt,
  };
}

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
    await this.scopedSaveWithManager(toOrm(customer), manager);
  }

  async findNameById(id: string): Promise<string | null> {
    const customer = await this.findById(id);
    return customer?.name ?? null;
  }
}
