import { ReceivableStatus } from '@casso-ledger/shared-types';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, FindOptionsWhere, Repository } from 'typeorm';
import { In, IsNull, LessThan, MoreThanOrEqual, Not } from 'typeorm';
import { BaseRepository } from '../../../common/tenancy/base.repository';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type {
  IReceivableRepository,
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
    return rows.map((row) => new Receivable(row));
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
    return rows.map((row) => new Receivable(row));
  }

  async findPage(
    organizationId: string,
    filters: ReceivableListFilters,
    page: number,
    limit: number,
  ): Promise<Receivable[]> {
    const where: FindOptionsWhere<ReceivableOrmEntity> = { organizationId };
    if (filters.status) {
      where.status = filters.status as ReceivableStatus;
    }
    if (filters.salesRepresentativeId) {
      where.salesRepresentativeId = filters.salesRepresentativeId;
    }
    const rows = await this.ormRepo.find({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return rows.map((row) => new Receivable(row));
  }

  async count(
    organizationId: string,
    filters: ReceivableListFilters,
  ): Promise<number> {
    const where: FindOptionsWhere<ReceivableOrmEntity> = { organizationId };
    if (filters.status) {
      where.status = filters.status as ReceivableStatus;
    }
    if (filters.salesRepresentativeId) {
      where.salesRepresentativeId = filters.salesRepresentativeId;
    }
    return this.ormRepo.count({ where });
  }
}
