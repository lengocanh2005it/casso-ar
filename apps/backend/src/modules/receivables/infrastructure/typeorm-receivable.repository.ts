import { ReceivableStatus } from '@casso-ar/shared-types';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, FindOptionsWhere, Repository } from 'typeorm';
import {
  In,
  IsNull,
  LessThan,
  LessThanOrEqual,
  MoreThan,
  MoreThanOrEqual,
  Not,
} from 'typeorm';
import { BaseRepository } from '../../../common/tenancy/base.repository';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type {
  IReceivableRepository,
  OverdueReceivableFilters,
  ReceivableListFilters,
} from '../application/receivable-repository.port';
import { Receivable } from '../domain/receivable';
import { ReceivableOrmEntity } from './receivable.orm-entity';

// Explicit domain → ORM translation: the compiler checks every field, so a
// drift between the two shapes fails here instead of being cast away.
function toOrm(receivable: Receivable): ReceivableOrmEntity {
  return {
    id: receivable.id,
    organizationId: receivable.organizationId,
    customerId: receivable.customerId,
    invoiceId: receivable.invoiceId,
    originalAmount: receivable.originalAmount,
    paidAmount: receivable.paidAmount,
    dueDate: receivable.dueDate,
    status: receivable.status,
    salesRepresentativeId: receivable.salesRepresentativeId,
    createdAt: receivable.createdAt,
    closedAt: receivable.closedAt,
    version: receivable.version,
  };
}

function toDomain(row: ReceivableOrmEntity): Receivable {
  return new Receivable({
    id: row.id,
    organizationId: row.organizationId,
    customerId: row.customerId,
    invoiceId: row.invoiceId,
    originalAmount: row.originalAmount,
    paidAmount: row.paidAmount,
    dueDate: row.dueDate,
    status: row.status,
    salesRepresentativeId: row.salesRepresentativeId,
    createdAt: row.createdAt,
    closedAt: row.closedAt,
    version: row.version,
  });
}

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
    return row ? toDomain(row) : null;
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
    return row ? toDomain(row) : null;
  }

  async save(receivable: Receivable, manager?: EntityManager): Promise<void> {
    await this.scopedSaveWithManager(toOrm(receivable), manager);
  }

  async findOpenByCustomerId(customerId: string): Promise<Receivable[]> {
    const organizationId = this.tenantContext.getOrganizationId();
    const rows = await this.ormRepo.find({
      where: [
        { organizationId, customerId, status: ReceivableStatus.OPEN },
        { organizationId, customerId, status: ReceivableStatus.PARTIALLY_PAID },
      ],
      take: 100,
    });
    return rows.map(toDomain);
  }

  async findOpenByIds(ids: string[]): Promise<Receivable[]> {
    if (ids.length === 0) return [];
    const organizationId = this.tenantContext.getOrganizationId();
    const rows = await this.ormRepo.find({
      where: {
        id: In(ids),
        organizationId,
        status: In([ReceivableStatus.OPEN, ReceivableStatus.PARTIALLY_PAID]),
      },
      select: {
        id: true,
        organizationId: true,
        customerId: true,
        invoiceId: true,
        originalAmount: true,
        paidAmount: true,
        dueDate: true,
        status: true,
        salesRepresentativeId: true,
        createdAt: true,
        closedAt: true,
        version: true,
      },
    });
    return rows.map(toDomain);
  }

  async findOverdueByThreshold(
    organizationId: string,
    minDaysOverdue: number,
    afterId: string | null,
    limit: number,
  ): Promise<Receivable[]> {
    const currentOrganizationId = this.tenantContext.getOrganizationId();
    if (currentOrganizationId !== organizationId) {
      throw new Error('TENANT_MISMATCH');
    }
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - minDaysOverdue);
    const rows = await this.ormRepo.find({
      where: {
        organizationId: currentOrganizationId,
        status: In([ReceivableStatus.OPEN, ReceivableStatus.PARTIALLY_PAID]),
        dueDate: LessThanOrEqual(cutoff),
        ...(afterId ? { id: MoreThan(afterId) } : {}),
      },
      order: { id: 'ASC' },
      take: limit,
      select: {
        id: true,
        organizationId: true,
        customerId: true,
        invoiceId: true,
        originalAmount: true,
        paidAmount: true,
        dueDate: true,
        status: true,
        salesRepresentativeId: true,
        createdAt: true,
        closedAt: true,
        version: true,
      },
    });
    return rows.map(toDomain);
  }

  async findOverdueCandidates(
    filters: OverdueReceivableFilters,
  ): Promise<Receivable[]> {
    const currentOrganizationId = this.tenantContext.getOrganizationId();
    if (currentOrganizationId !== filters.organizationId) {
      throw new Error('TENANT_MISMATCH');
    }

    const qb = this.ormRepo
      .createQueryBuilder('r')
      .select([
        'r.id',
        'r.organizationId',
        'r.customerId',
        'r.invoiceId',
        'r.originalAmount',
        'r.paidAmount',
        'r.dueDate',
        'r.status',
        'r.salesRepresentativeId',
        'r.createdAt',
        'r.closedAt',
        'r.version',
      ])
      .where('r.organizationId = :organizationId', {
        organizationId: filters.organizationId,
      })
      .andWhere('r.status IN (:...statuses)', {
        statuses: [ReceivableStatus.OPEN, ReceivableStatus.PARTIALLY_PAID],
      })
      .andWhere('r.dueDate < :referenceDate', {
        referenceDate: filters.referenceDate,
      })
      .andWhere('r.originalAmount > r.paidAmount');

    if (filters.salesRepresentativeId) {
      qb.andWhere('r.salesRepresentativeId = :salesRepresentativeId', {
        salesRepresentativeId: filters.salesRepresentativeId,
      });
    }

    if (
      filters.customerIdIn !== undefined ||
      filters.invoiceIdIn !== undefined
    ) {
      const hasCustomerIds = (filters.customerIdIn?.length ?? 0) > 0;
      const hasInvoiceIds = (filters.invoiceIdIn?.length ?? 0) > 0;

      if (hasCustomerIds && hasInvoiceIds) {
        qb.andWhere(
          '(r.customerId IN (:...customerIds) OR r.invoiceId IN (:...invoiceIds))',
          {
            customerIds: filters.customerIdIn,
            invoiceIds: filters.invoiceIdIn,
          },
        );
      } else if (hasCustomerIds) {
        qb.andWhere('r.customerId IN (:...customerIds)', {
          customerIds: filters.customerIdIn,
        });
      } else if (hasInvoiceIds) {
        qb.andWhere('r.invoiceId IN (:...invoiceIds)', {
          invoiceIds: filters.invoiceIdIn,
        });
      } else {
        qb.andWhere('1 = 0');
      }
    }

    qb.orderBy('r.dueDate', 'ASC')
      .addOrderBy('r.id', 'ASC')
      .take(filters.limit);

    const rows = await qb.getMany();
    return rows.map(toDomain);
  }

  async findInvoiceIdsByReceivableIds(
    ids: string[],
  ): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const organizationId = this.tenantContext.getOrganizationId();
    const rows = await this.ormRepo.find({
      where: { id: In(ids), organizationId, invoiceId: Not(IsNull()) },
      select: { id: true, invoiceId: true },
    });
    return new Map(
      rows.flatMap((row) => (row.invoiceId ? [[row.id, row.invoiceId]] : [])),
    );
  }

  // Two index-served range scans (organizationId, status, dueDate) instead
  // of one ORDER BY on a computed expression, which would force Postgres to
  // sort every open receivable in the org before applying LIMIT. Each side
  // fetches at most `limit` rows already ordered by distance from
  // referenceDate; the small in-memory merge (<= 2*limit rows) picks the
  // true N closest.
  async findOpenTopNByOrganization(
    organizationId: string,
    limit: number,
    referenceDate: Date,
  ): Promise<Receivable[]> {
    const statuses = [ReceivableStatus.OPEN, ReceivableStatus.PARTIALLY_PAID];
    const [onOrAfter, before] = await Promise.all([
      this.ormRepo.find({
        where: {
          organizationId,
          status: In(statuses),
          dueDate: MoreThanOrEqual(referenceDate),
        },
        order: { dueDate: 'ASC' },
        take: limit,
      }),
      this.ormRepo.find({
        where: {
          organizationId,
          status: In(statuses),
          dueDate: LessThan(referenceDate),
        },
        order: { dueDate: 'DESC' },
        take: limit,
      }),
    ]);
    const referenceTime = referenceDate.getTime();
    const rows = [...onOrAfter, ...before]
      .sort(
        (left, right) =>
          Math.abs(left.dueDate.getTime() - referenceTime) -
          Math.abs(right.dueDate.getTime() - referenceTime),
      )
      .slice(0, limit);
    return rows.map(toDomain);
  }

  async findPage(
    organizationId: string,
    filters: ReceivableListFilters,
    page: number,
    limit: number,
  ): Promise<Receivable[]> {
    const rows = await this.ormRepo.find({
      where: buildWhere(organizationId, filters),
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return rows.map(toDomain);
  }

  async count(
    organizationId: string,
    filters: ReceivableListFilters,
  ): Promise<number> {
    return this.ormRepo.count({ where: buildWhere(organizationId, filters) });
  }
}

// A search term resolves to matching customerIds/invoiceIds upstream (see
// ListReceivablesUseCase); here they become OR branches (TypeORM: an array
// of where-objects is OR'd) each still AND'd with the scalar filters below.
function buildWhere(
  organizationId: string,
  filters: ReceivableListFilters,
):
  | FindOptionsWhere<ReceivableOrmEntity>
  | FindOptionsWhere<ReceivableOrmEntity>[] {
  const base: FindOptionsWhere<ReceivableOrmEntity> = { organizationId };
  if (filters.status) {
    base.status = filters.status as ReceivableStatus;
  }
  if (filters.salesRepresentativeId) {
    base.salesRepresentativeId = filters.salesRepresentativeId;
  }
  if (filters.customerId) {
    base.customerId = filters.customerId;
  }

  if (filters.customerIdIn === undefined && filters.invoiceIdIn === undefined) {
    return base;
  }

  const branches: FindOptionsWhere<ReceivableOrmEntity>[] = [];
  if (filters.customerIdIn?.length) {
    branches.push({ ...base, customerId: In(filters.customerIdIn) });
  }
  if (filters.invoiceIdIn?.length) {
    branches.push({ ...base, invoiceId: In(filters.invoiceIdIn) });
  }
  // Search matched nothing: force a no-result query instead of falling
  // through to the unfiltered `base` where, which would return every row.
  return branches.length > 0 ? branches : [{ ...base, id: In([]) }];
}
