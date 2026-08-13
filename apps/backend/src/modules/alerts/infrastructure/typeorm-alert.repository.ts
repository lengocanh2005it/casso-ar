import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { BaseRepository } from '../../../common/tenancy/base.repository';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type {
  AlertPage,
  IAlertRepository,
} from '../application/alert-repository.port';
import { Alert } from '../domain/alert';
import { AlertOrmEntity } from './alert.orm-entity';

@Injectable()
export class TypeOrmAlertRepository
  extends BaseRepository<AlertOrmEntity>
  implements IAlertRepository
{
  constructor(
    @InjectRepository(AlertOrmEntity) ormRepo: Repository<AlertOrmEntity>,
    private readonly dataSource: DataSource,
    tenantContext: TenantContextService,
  ) {
    super(ormRepo, tenantContext);
  }

  async upsertUnread(alert: Alert): Promise<void> {
    const organizationId = this.tenantContext.getOrganizationId();
    if (alert.organizationId !== organizationId) {
      throw new AppError(
        ErrorCode.TENANT_MISMATCH,
        'Tổ chức không khớp với ngữ cảnh hiện tại.',
      );
    }
    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `INSERT INTO "alerts" ("id", "organizationId", "userId", "type", "entityType", "entityId", "readAt", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, NULL, $7)
         ON CONFLICT ("userId", "entityType", "entityId", "type") WHERE "readAt" IS NULL
         DO UPDATE SET "createdAt" = EXCLUDED."createdAt"`,
        [
          alert.id,
          alert.organizationId,
          alert.userId,
          alert.type,
          alert.entityType,
          alert.entityId,
          alert.createdAt,
        ],
      );
    });
  }

  async countUnread(userId: string): Promise<number> {
    const organizationId = this.tenantContext.getOrganizationId();
    return this.ormRepo.count({
      where: { organizationId, userId, readAt: IsNull() },
    });
  }

  private toDomain(row: AlertOrmEntity): Alert {
    return new Alert({
      id: row.id,
      organizationId: row.organizationId,
      userId: row.userId,
      type: row.type,
      entityType: row.entityType,
      entityId: row.entityId,
      readAt: row.readAt,
      createdAt: row.createdAt,
    });
  }

  async findPage(
    userId: string,
    page: number,
    limit: number,
    unreadOnly: boolean,
  ): Promise<AlertPage> {
    const organizationId = this.tenantContext.getOrganizationId();
    const qb = this.ormRepo
      .createQueryBuilder('alert')
      .where('alert.organizationId = :organizationId', { organizationId })
      .andWhere('alert.userId = :userId', { userId });
    if (unreadOnly) {
      qb.andWhere('alert.readAt IS NULL');
    }
    const [rows, total] = await qb
      .orderBy('alert.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    const unreadCount = await this.countUnread(userId);
    return { items: rows.map((row) => this.toDomain(row)), total, unreadCount };
  }

  async findByIdForUser(id: string, userId: string): Promise<Alert | null> {
    const organizationId = this.tenantContext.getOrganizationId();
    const row = await this.ormRepo.findOne({
      where: { id, organizationId, userId },
    });
    return row ? this.toDomain(row) : null;
  }

  async markRead(id: string, userId: string): Promise<void> {
    const organizationId = this.tenantContext.getOrganizationId();
    await this.dataSource.transaction(async (manager) => {
      await manager
        .getRepository(AlertOrmEntity)
        .createQueryBuilder()
        .update()
        .set({ readAt: new Date() })
        .where('id = :id', { id })
        .andWhere('organizationId = :organizationId AND userId = :userId', {
          organizationId,
          userId,
        })
        .andWhere('"readAt" IS NULL')
        .execute();
    });
  }

  async markAllRead(userId: string): Promise<void> {
    const organizationId = this.tenantContext.getOrganizationId();
    await this.dataSource.transaction(async (manager) => {
      await manager
        .getRepository(AlertOrmEntity)
        .createQueryBuilder()
        .update()
        .set({ readAt: new Date() })
        .where('organizationId = :organizationId AND userId = :userId', {
          organizationId,
          userId,
        })
        .andWhere('"readAt" IS NULL')
        .execute();
    });
  }

  async delete(id: string, userId: string): Promise<void> {
    const organizationId = this.tenantContext.getOrganizationId();
    await this.dataSource.transaction(async (manager) => {
      await manager
        .getRepository(AlertOrmEntity)
        .delete({ id, organizationId, userId });
    });
  }

  async deleteAll(userId: string): Promise<void> {
    const organizationId = this.tenantContext.getOrganizationId();
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(AlertOrmEntity).delete({
        organizationId,
        userId,
      });
    });
  }
}
