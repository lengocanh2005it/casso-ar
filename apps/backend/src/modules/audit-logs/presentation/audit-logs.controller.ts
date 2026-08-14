import { Permission } from '@casso-ledger/shared-types';
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuditLog } from '../../../common/audit/audit-log';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { ListAuditLogsUseCase } from '../application/list-audit-logs.usecase';
import { ListAuditLogsQuery } from './dto/list-audit-logs.query';

interface AuditLogItemResponse {
  id: string;
  userId: string;
  actionType: string;
  entityType: string;
  entityId: string;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: Date;
}

function toAuditLogItemResponse(log: AuditLog): AuditLogItemResponse {
  return {
    id: log.id,
    userId: log.userId,
    actionType: log.actionType,
    entityType: log.entityType,
    entityId: log.entityId,
    beforeState: log.beforeState,
    afterState: log.afterState,
    ipAddress: log.ipAddress,
    createdAt: log.createdAt,
  };
}

@ApiTags('audit-logs')
@Controller('audit-logs')
@UseGuards(PermissionGuard)
export class AuditLogsController {
  constructor(private readonly listAuditLogsUseCase: ListAuditLogsUseCase) {}

  @Get()
  @RequirePermission(Permission.AUDIT_LOG_READ)
  async findMany(@Query() query: ListAuditLogsQuery) {
    const result = await this.listAuditLogsUseCase.execute({
      page: query.page,
      limit: query.limit,
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.actionType ? { actionType: query.actionType } : {}),
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
      ...(query.from ? { from: new Date(query.from) } : {}),
      ...(query.to ? { to: new Date(query.to) } : {}),
    });
    return {
      items: result.items.map(toAuditLogItemResponse),
      total: result.total,
    };
  }
}
