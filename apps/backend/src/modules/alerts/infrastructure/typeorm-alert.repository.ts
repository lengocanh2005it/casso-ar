import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { BaseRepository } from '../../../common/tenancy/base.repository';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { Alert } from '../domain/alert';
import { AlertOrmEntity } from './alert.orm-entity';

@Injectable()
export class TypeOrmAlertRepository extends BaseRepository<AlertOrmEntity> {
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
}
