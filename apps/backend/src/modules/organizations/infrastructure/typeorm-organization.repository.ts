import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import { In, QueryFailedError } from 'typeorm';
import { isUniqueViolation } from '../../../common/database/unique-violation';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  DUPLICATE_TAX_CODE,
  type IOrganizationRepository,
  type OrganizationListItem,
} from '../application/organization-repository.port';
import { Organization, type OrganizationStatus } from '../domain/organization';
import { OrganizationOrmEntity } from './organization.orm-entity';

const TAX_CODE_UNIQUE_CONSTRAINT = 'UQ_organizations_tax_code';

const ALL_STATUSES: readonly OrganizationStatus[] = [
  'ACTIVE',
  'LOCKED',
  'PENDING_REVIEW',
  'REJECTED',
];

const SELECT_COLUMNS = {
  id: true,
  name: true,
  status: true,
  taxCode: true,
  taxCodeMatched: true,
  taxCodeLookupName: true,
  createdAt: true,
} as const;

function toDomain(row: OrganizationOrmEntity): Organization {
  return new Organization({
    id: row.id,
    name: row.name,
    status: row.status,
    taxCode: row.taxCode,
    taxCodeMatched: row.taxCodeMatched,
    taxCodeLookupName: row.taxCodeLookupName,
    createdAt: row.createdAt,
  });
}

function toOrm(organization: Organization): OrganizationOrmEntity {
  const row = new OrganizationOrmEntity();
  row.id = organization.id;
  row.name = organization.name;
  row.status = organization.status;
  row.taxCode = organization.taxCode;
  row.taxCodeMatched = organization.taxCodeMatched;
  row.taxCodeLookupName = organization.taxCodeLookupName;
  row.createdAt = organization.createdAt;
  return row;
}

@Injectable()
export class TypeOrmOrganizationRepository implements IOrganizationRepository {
  constructor(
    @InjectRepository(OrganizationOrmEntity)
    private readonly repo: Repository<OrganizationOrmEntity>,
  ) {}

  async findById(
    id: string,
    manager?: EntityManager,
  ): Promise<Organization | null> {
    const row = await (manager
      ? manager.getRepository(OrganizationOrmEntity)
      : this.repo
    ).findOne({ select: SELECT_COLUMNS, where: { id } });
    return row ? toDomain(row) : null;
  }

  async findAllIds(): Promise<string[]> {
    const rows = await this.repo.find({ select: { id: true } });
    return rows.map((row) => row.id);
  }

  async countByStatus(): Promise<Record<OrganizationStatus, number>> {
    // One grouped query rather than a count per status. Callers use this for
    // summary tiles, which must reflect the whole installation — deriving them
    // from one page of rows under-reported past the page limit.
    const rows = await this.repo
      .createQueryBuilder('organization')
      .select('organization.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('organization.status')
      .getRawMany<{ status: OrganizationStatus; count: string }>();

    const counts = Object.fromEntries(
      ALL_STATUSES.map((status) => [status, 0]),
    ) as Record<OrganizationStatus, number>;
    for (const row of rows) {
      if (row.status in counts) {
        counts[row.status] = Number(row.count);
      }
    }
    return counts;
  }

  async findAllPaginated(
    page: number,
    limit: number,
    status?: OrganizationStatus,
  ): Promise<{ items: OrganizationListItem[]; total: number }> {
    const [rows, total] = await this.repo.findAndCount({
      select: SELECT_COLUMNS,
      where: status ? { status } : {},
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        name: row.name,
        status: row.status,
        taxCode: row.taxCode,
        taxCodeMatched: row.taxCodeMatched,
        taxCodeLookupName: row.taxCodeLookupName,
        createdAt: row.createdAt,
      })),
      total,
    };
  }

  async findByIds(ids: string[]): Promise<Map<string, Organization>> {
    if (ids.length === 0) return new Map();
    const rows = await this.repo.find({
      select: SELECT_COLUMNS,
      where: { id: In(ids) },
    });
    return new Map(rows.map((row) => [row.id, toDomain(row)]));
  }

  async findByTaxCode(
    taxCode: string,
    manager?: EntityManager,
  ): Promise<Organization | null> {
    const row = await (manager
      ? manager.getRepository(OrganizationOrmEntity)
      : this.repo
    ).findOne({ select: SELECT_COLUMNS, where: { taxCode } });
    return row ? toDomain(row) : null;
  }

  async save(
    organization: Organization,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager
      ? manager.getRepository(OrganizationOrmEntity)
      : this.repo;
    try {
      await repo.save(toOrm(organization));
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        isUniqueViolation(error) &&
        this.isTaxCodeConstraint(error)
      ) {
        throw new AppError(
          ErrorCode.CONFLICT,
          'Mã số thuế này đã được đăng ký.',
          {
            rowErrorCode: DUPLICATE_TAX_CODE,
          },
        );
      }
      throw error;
    }
  }

  private isTaxCodeConstraint(error: QueryFailedError): boolean {
    if (typeof error.driverError !== 'object' || error.driverError === null) {
      return false;
    }
    return (
      'constraint' in error.driverError &&
      error.driverError.constraint === TAX_CODE_UNIQUE_CONSTRAINT
    );
  }
}
