import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type {
  EntityManager,
  FindOptionsSelect,
  FindOptionsWhere,
  Repository,
} from 'typeorm';
import { In } from 'typeorm';
import { BaseRepository } from '../../../common/tenancy/base.repository';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { ICustomerRepository } from '../application/customer-repository.port';
import type { Customer } from '../domain/customer';
import { CustomerOrmEntity } from './customer.orm-entity';

const CUSTOMER_SELECT = {
  id: true,
  organizationId: true,
  name: true,
  taxCode: true,
  email: true,
  phone: true,
  defaultPaymentTermDays: true,
  creditLimit: true,
  priority: true,
  customerGroup: true,
  createdAt: true,
} satisfies FindOptionsSelect<CustomerOrmEntity>;

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
    customerGroup: customer.customerGroup,
    createdAt: customer.createdAt,
  };
}

function toDomain(row: CustomerOrmEntity): Customer {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    taxCode: row.taxCode,
    email: row.email,
    phone: row.phone,
    defaultPaymentTermDays: row.defaultPaymentTermDays,
    creditLimit: row.creditLimit,
    priority: row.priority,
    customerGroup: row.customerGroup,
    createdAt: row.createdAt,
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

  async findById(
    id: string,
    manager?: EntityManager,
  ): Promise<Customer | null> {
    return this.findOneScoped({ id }, manager);
  }

  async findByIds(ids: string[]): Promise<Map<string, Customer>> {
    if (ids.length === 0) return new Map();
    const organizationId = this.tenantContext.getOrganizationId();
    const rows = await this.ormRepo.find({
      select: CUSTOMER_SELECT,
      where: { id: In(ids), organizationId },
    });
    return new Map(rows.map((row) => [row.id, toDomain(row)]));
  }

  async findByTaxCode(
    taxCode: string,
    manager?: EntityManager,
  ): Promise<Customer | null> {
    return this.findOneScoped({ taxCode }, manager);
  }

  async findByEmail(
    email: string,
    manager?: EntityManager,
  ): Promise<Customer | null> {
    return this.findOneScoped({ email }, manager);
  }

  private async findOneScoped(
    where: FindOptionsWhere<CustomerOrmEntity>,
    manager?: EntityManager,
  ): Promise<Customer | null> {
    const organizationId = this.tenantContext.getOrganizationId();
    const repo = manager
      ? manager.getRepository(CustomerOrmEntity)
      : this.ormRepo;
    const row = await repo.findOne({
      select: CUSTOMER_SELECT,
      where: { ...where, organizationId },
    });
    return row ? toDomain(row) : null;
  }

  async save(customer: Customer, manager?: EntityManager): Promise<void> {
    await this.scopedSaveWithManager(toOrm(customer), manager);
  }

  async findNameById(id: string): Promise<string | null> {
    const customer = await this.findById(id);
    return customer?.name ?? null;
  }

  async findPage(
    organizationId: string,
    search: string | undefined,
    page: number,
    limit: number,
  ): Promise<Customer[]> {
    const qb = this.ormRepo
      .createQueryBuilder('c')
      .where('c.organizationId = :organizationId', { organizationId });

    if (search) {
      qb.andWhere(
        '(c.name ILIKE :search OR c.taxCode ILIKE :search OR c.phone ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const rows = await qb
      .orderBy('c.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return rows.map(toDomain);
  }

  async count(
    organizationId: string,
    search: string | undefined,
  ): Promise<number> {
    const qb = this.ormRepo
      .createQueryBuilder('c')
      .where('c.organizationId = :organizationId', { organizationId });

    if (search) {
      qb.andWhere(
        '(c.name ILIKE :search OR c.taxCode ILIKE :search OR c.phone ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    return qb.getCount();
  }
}
