import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import { In } from 'typeorm';
import type {
  IOrganizationRepository,
  OrganizationListItem,
} from '../application/organization-repository.port';
import { Organization } from '../domain/organization';
import { OrganizationOrmEntity } from './organization.orm-entity';

function toDomain(row: OrganizationOrmEntity): Organization {
  return new Organization({
    id: row.id,
    name: row.name,
    status: row.status,
    createdAt: row.createdAt,
  });
}

function toOrm(organization: Organization): OrganizationOrmEntity {
  const row = new OrganizationOrmEntity();
  row.id = organization.id;
  row.name = organization.name;
  row.status = organization.status;
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
    ).findOne({
      select: { id: true, name: true, status: true, createdAt: true },
      where: { id },
    });
    return row ? toDomain(row) : null;
  }

  async findAllIds(): Promise<string[]> {
    const rows = await this.repo.find({ select: { id: true } });
    return rows.map((row) => row.id);
  }

  async findAllPaginated(
    page: number,
    limit: number,
  ): Promise<{ items: OrganizationListItem[]; total: number }> {
    const [rows, total] = await this.repo.findAndCount({
      select: { id: true, name: true, status: true, createdAt: true },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        name: row.name,
        status: row.status,
        createdAt: row.createdAt,
      })),
      total,
    };
  }

  async findByIds(ids: string[]): Promise<Map<string, Organization>> {
    if (ids.length === 0) return new Map();
    const rows = await this.repo.find({
      select: { id: true, name: true, status: true, createdAt: true },
      where: { id: In(ids) },
    });
    return new Map(rows.map((row) => [row.id, toDomain(row)]));
  }

  async save(
    organization: Organization,
    manager?: EntityManager,
  ): Promise<void> {
    await (manager
      ? manager.getRepository(OrganizationOrmEntity)
      : this.repo
    ).save(toOrm(organization));
  }
}
