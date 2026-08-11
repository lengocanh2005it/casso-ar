import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { ISmtpConfigRepository } from '../application/smtp-config-repository.port';
import { OrganizationSmtpConfig } from '../domain/organization-smtp-config';
import { OrganizationSmtpConfigOrmEntity } from './organization-smtp-config.orm-entity';

function toOrm(
  config: OrganizationSmtpConfig,
): Partial<OrganizationSmtpConfigOrmEntity> {
  return {
    id: config.id,
    organizationId: config.organizationId,
    host: config.host,
    port: config.port,
    username: config.username,
    encryptedPassword: config.encryptedPassword,
    fromAddress: config.fromAddress,
    status: config.status,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  };
}

function toDomain(
  row: OrganizationSmtpConfigOrmEntity,
): OrganizationSmtpConfig {
  return new OrganizationSmtpConfig({
    id: row.id,
    organizationId: row.organizationId,
    host: row.host,
    port: row.port,
    username: row.username,
    encryptedPassword: row.encryptedPassword,
    fromAddress: row.fromAddress,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  });
}

@Injectable()
export class TypeOrmSmtpConfigRepository implements ISmtpConfigRepository {
  constructor(
    @InjectRepository(OrganizationSmtpConfigOrmEntity)
    private readonly repo: Repository<OrganizationSmtpConfigOrmEntity>,
  ) {}

  async findByOrganizationId(
    organizationId: string,
  ): Promise<OrganizationSmtpConfig | null> {
    const row = await this.repo.findOne({ where: { organizationId } });
    return row ? toDomain(row) : null;
  }

  async save(config: OrganizationSmtpConfig): Promise<void> {
    await this.repo.upsert(toOrm(config), ['organizationId']);
  }

  async deleteByOrganizationId(organizationId: string): Promise<void> {
    await this.repo.delete({ organizationId });
  }
}
