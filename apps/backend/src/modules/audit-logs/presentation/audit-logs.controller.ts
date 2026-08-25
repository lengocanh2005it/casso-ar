import { Permission } from '@casso-ar/shared-types';
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditLog } from '../../../common/audit/audit-log';
import { ErrorCode } from '../../../common/errors/error-code';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { ApiErrorResponse } from '../../../common/swagger/api-error-response.decorator';
import { ListAuditLogsUseCase } from '../application/list-audit-logs.usecase';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';
import {
  AuditLogItemResponse,
  ListAuditLogsResponseDto,
} from './dto/list-audit-logs-response.dto';

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
  @ApiOperation({ summary: 'List audit logs with pagination and filters' })
  @ApiOkResponse({ type: ListAuditLogsResponseDto })
  @ApiErrorResponse(ErrorCode.VALIDATION_ERROR)
  @RequirePermission(Permission.AUDIT_LOG_READ)
  async findMany(@Query() query: ListAuditLogsQueryDto) {
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
