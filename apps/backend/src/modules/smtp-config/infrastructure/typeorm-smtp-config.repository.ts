import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { ISmtpConfigRepository } from '../application/smtp-config-repository.port';
import {
  OrganizationSmtpConfig,
  SmtpConfigStatus,
} from '../domain/organization-smtp-config';
import { OrganizationSmtpConfigOrmEntity } from './organization-smtp-config.orm-entity';

function toOrm(
  config: OrganizationSmtpConfig,
): OrganizationSmtpConfigOrmEntity {
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
    version: config.version,
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
    private readonly dataSource: DataSource,
  ) {}

  async findByOrganizationId(
    organizationId: string,
  ): Promise<OrganizationSmtpConfig | null> {
    const row = await this.repo.findOne({
      select: {
        id: true,
        organizationId: true,
        host: true,
        port: true,
        username: true,
        encryptedPassword: true,
        fromAddress: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        version: true,
      },
      where: { organizationId },
    });
    return row ? toDomain(row) : null;
  }

  async save(config: OrganizationSmtpConfig): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager
        .getRepository(OrganizationSmtpConfigOrmEntity)
        .upsert(toOrm(config), ['organizationId']);
    });
  }

  async markFailedIfVersionMatches(
    config: OrganizationSmtpConfig,
  ): Promise<boolean> {
    const result = await this.dataSource.transaction(async (manager) =>
      manager
        .getRepository(OrganizationSmtpConfigOrmEntity)
        .createQueryBuilder()
        .update()
        .set({
          status: config.status,
          updatedAt: config.updatedAt,
          version: config.version + 1,
        })
        .where('"organizationId" = :organizationId', {
          organizationId: config.organizationId,
        })
        .andWhere('status = :connected AND version = :version', {
          connected: SmtpConfigStatus.CONNECTED,
          version: config.version,
        })
        .execute(),
    );
    return result.affected === 1;
  }

  async deleteByOrganizationId(organizationId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager
        .getRepository(OrganizationSmtpConfigOrmEntity)
        .delete({ organizationId });
    });
  }
}
