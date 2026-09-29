import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type {
  EntityManager,
  FindOptionsSelect,
  FindOptionsWhere,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { In } from 'typeorm';
import { toLikePattern } from '../../../common/database/like-pattern';
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

const CUSTOMER_QUERY_SELECT = Object.keys(CUSTOMER_SELECT).map(
  (column) => `c.${column}`,
);

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

  async findByIdForSalesRep(
    id: string,
    salesRepresentativeId: string,
  ): Promise<Customer | null> {
    const organizationId = this.tenantContext.getOrganizationId();
    const row = await this.buildCustomerReadQuery(
      organizationId,
      undefined,
      salesRepresentativeId,
    )
      .andWhere('c.id = :id', { id })
      .getOne();
    return row ? toDomain(row) : null;
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

  async findIdsBySearch(
    organizationId: string,
    search: string,
  ): Promise<string[]> {
    const rows = await this.ormRepo
      .createQueryBuilder('c')
      .select('c.id', 'id')
      .where('c.organizationId = :organizationId', { organizationId })
      .andWhere(
        '(c.name ILIKE :search OR c.taxCode ILIKE :search OR c.phone ILIKE :search)',
        { search: toLikePattern(search) },
      )
      .getRawMany<{ id: string }>();
    return rows.map((row) => row.id);
  }

  async findPage(
    organizationId: string,
    search: string | undefined,
    page: number,
    limit: number,
    salesRepresentativeId?: string,
  ): Promise<Customer[]> {
    const rows = await this.buildCustomerReadQuery(
      organizationId,
      search,
      salesRepresentativeId,
    )
      .orderBy('c.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return rows.map(toDomain);
  }

  async count(
    organizationId: string,
    search: string | undefined,
    salesRepresentativeId?: string,
  ): Promise<number> {
    return this.buildCustomerReadQuery(
      organizationId,
      search,
      salesRepresentativeId,
    ).getCount();
  }

  private buildCustomerReadQuery(
    organizationId: string,
    search: string | undefined,
    salesRepresentativeId?: string,
  ): SelectQueryBuilder<CustomerOrmEntity> {
    const qb = this.ormRepo
      .createQueryBuilder('c')
      .select(CUSTOMER_QUERY_SELECT)
      .where('c.organizationId = :organizationId', { organizationId });

    if (search) {
      qb.andWhere(
        '(c.name ILIKE :search OR c.taxCode ILIKE :search OR c.phone ILIKE :search)',
        { search: toLikePattern(search) },
      );
    }

    if (salesRepresentativeId) {
      qb.andWhere(
        `EXISTS (
          SELECT 1
          FROM "receivables" r
          WHERE r."organizationId" = c."organizationId"
            AND r."customerId" = c."id"::text
            AND r."salesRepresentativeId" = :salesRepresentativeId
        )`,
        { salesRepresentativeId },
      );
    }

    return qb;
  }
}
