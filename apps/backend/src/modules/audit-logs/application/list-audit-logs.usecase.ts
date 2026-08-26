import { Inject, Injectable } from '@nestjs/common';
import type {
  AuditActionType,
  AuditEntityType,
} from '../../../common/audit/audit.enums';
import { AuditLog } from '../../../common/audit/audit-log';
import {
  AUDIT_LOG_REPOSITORY,
  type AuditLogPageQuery,
  type IAuditLogRepository,
} from '../../../common/audit/audit-log-repository.port';
import { TenantContextService } from '../../../common/tenancy/tenant-context';

export interface ListAuditLogsInput {
  page: number;
  limit: number;
  entityType?: AuditEntityType;
  actionType?: AuditActionType;
  actorUserId?: string;
  receivableId?: string;
  from?: Date;
  to?: Date;
}

@Injectable()
export class ListAuditLogsUseCase {
  constructor(
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly repo: IAuditLogRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(
    input: ListAuditLogsInput,
  ): Promise<{ items: AuditLog[]; total: number }> {
    const query: AuditLogPageQuery = {
      organizationId: this.tenantContext.getOrganizationId(),
      page: input.page,
      limit: input.limit,
      ...(input.entityType ? { entityType: input.entityType } : {}),
      ...(input.actionType ? { actionType: input.actionType } : {}),
      ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
      ...(input.receivableId
        ? { relatedReceivableId: input.receivableId }
        : {}),
      ...(input.from ? { from: input.from } : {}),
      ...(input.to ? { to: input.to } : {}),
    };
    return this.repo.findPage(query);
  }
}
