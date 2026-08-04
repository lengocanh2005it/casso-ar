import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import type { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { ICustomerRepository } from '../application/customer-repository.port';
import { Customer } from '../domain/customer';
import { CustomerOrmEntity } from './customer.orm-entity';

@Injectable()
export class TypeOrmCustomerRepository implements ICustomerRepository {
  constructor(
    @InjectRepository(CustomerOrmEntity)
    private readonly repo: Repository<CustomerOrmEntity>,
    private readonly tenantContext: TenantContextService,
  ) {}

  async findById(id: string): Promise<Customer | null> {
    const row = await this.repo.findOne({
      where: { id, organizationId: this.tenantContext.getOrganizationId() },
    });
    if (!row) return null;
    return new Customer(row);
  }

  async save(customer: Customer, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(CustomerOrmEntity) : this.repo;
    await repo.save({
      ...customer,
      organizationId: this.tenantContext.getOrganizationId(),
    } as CustomerOrmEntity);
  }
}
