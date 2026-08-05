import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import type { IOrganizationRepository } from '../application/organization-repository.port';
import { Organization } from '../domain/organization';
import { OrganizationOrmEntity } from './organization.orm-entity';

@Injectable()
export class TypeOrmOrganizationRepository implements IOrganizationRepository {
  constructor(
    @InjectRepository(OrganizationOrmEntity)
    private readonly repo: Repository<OrganizationOrmEntity>,
  ) {}

  async findById(id: string): Promise<Organization | null> {
    const row = await this.repo.findOne({ where: { id } });
    return row ? new Organization(row) : null;
  }

  async save(
    organization: Organization,
    manager?: EntityManager,
  ): Promise<void> {
    await (manager
      ? manager.getRepository(OrganizationOrmEntity)
      : this.repo
    ).save(organization);
  }
}
