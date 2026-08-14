import { Permission } from '@casso-ledger/shared-types';
import {
  Controller,
  Delete,
  Get,
  type MessageEvent,
  Param,
  Patch,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { filter, fromEvent, map, type Observable } from 'rxjs';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { ApiErrorResponse } from '../../../common/swagger/api-error-response.decorator';
import { successResponseSchema } from '../../../common/swagger/success-response-schema';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import {
  ALERT_CREATED_FOR_USER,
  type AlertCreatedForUserEvent,
} from '../application/create-alert.usecase';
import { DeleteAlertUseCase } from '../application/delete-alert.usecase';
import { DeleteAllAlertsUseCase } from '../application/delete-all-alerts.usecase';
import { ListAlertsUseCase } from '../application/list-alerts.usecase';
import { MarkAlertReadUseCase } from '../application/mark-alert-read.usecase';
import { MarkAllAlertsReadUseCase } from '../application/mark-all-alerts-read.usecase';
import {
  AlertsPageResponseDto,
  toAlertsPageResponse,
} from './dto/alert-response.dto';
import { AlertsPaginationDto } from './dto/alerts-pagination.dto';

@ApiTags('alerts')
@Controller('alerts')
@UseGuards(PermissionGuard)
export class AlertsController {
  constructor(
    private readonly listAlerts: ListAlertsUseCase,
    private readonly markAlertRead: MarkAlertReadUseCase,
    private readonly markAllAlertsRead: MarkAllAlertsReadUseCase,
    private readonly deleteAlert: DeleteAlertUseCase,
    private readonly deleteAllAlerts: DeleteAllAlertsUseCase,
    private readonly eventEmitter: EventEmitter2,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List alerts with pagination' })
  @ApiOkResponse({ type: AlertsPageResponseDto })
  @ApiErrorResponse(ErrorCode.VALIDATION_ERROR, ErrorCode.UNAUTHORIZED)
  @RequirePermission(Permission.ALERT_READ)
  async list(@Query() query: AlertsPaginationDto) {
    return toAlertsPageResponse(
      await this.listAlerts.execute(query.page, query.limit, query.unreadOnly),
    );
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark an alert as read' })
  @ApiOkResponse({
    description: 'Alert marked as read',
    schema: successResponseSchema(),
  })
  @ApiErrorResponse(ErrorCode.UNAUTHORIZED, ErrorCode.NOT_FOUND)
  @RequirePermission(Permission.ALERT_READ)
  async read(@Param('id') id: string) {
    await this.markAlertRead.execute(id);
    return { success: true };
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all alerts as read' })
  @ApiOkResponse({
    description: 'All alerts marked as read',
    schema: successResponseSchema(),
  })
  @ApiErrorResponse(ErrorCode.UNAUTHORIZED)
  @RequirePermission(Permission.ALERT_READ)
  async readAll() {
    await this.markAllAlertsRead.execute();
    return { success: true };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an alert' })
  @ApiOkResponse({
    description: 'Alert deleted',
    schema: successResponseSchema(),
  })
  @ApiErrorResponse(ErrorCode.UNAUTHORIZED, ErrorCode.NOT_FOUND)
  @RequirePermission(Permission.ALERT_READ)
  async remove(@Param('id') id: string) {
    await this.deleteAlert.execute(id);
    return { success: true };
  }

  @Delete()
  @ApiOperation({ summary: 'Delete all alerts' })
  @ApiOkResponse({
    description: 'All alerts deleted',
    schema: successResponseSchema(),
  })
  @ApiErrorResponse(ErrorCode.UNAUTHORIZED)
  @RequirePermission(Permission.ALERT_READ)
  async removeAll() {
    await this.deleteAllAlerts.execute();
    return { success: true };
  }

  @Sse('stream')
  @ApiOperation({ summary: 'Subscribe to realtime alert events (SSE)' })
  @ApiOkResponse({
    description: 'Server-Sent Events stream of alert.created events',
    content: {
      'text/event-stream': { schema: { type: 'string' } },
    },
  })
  @ApiErrorResponse(ErrorCode.UNAUTHORIZED)
  @RequirePermission(Permission.ALERT_READ)
  stream(): Observable<MessageEvent> {
    const user = this.tenantContext.getCurrentUser();
    if (!user) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Yêu cầu đăng nhập.');
    }
    const userId = user.userId;
    return fromEvent(this.eventEmitter, ALERT_CREATED_FOR_USER).pipe(
      filter(
        (payload) => (payload as AlertCreatedForUserEvent).userId === userId,
      ),
      map(
        (payload): MessageEvent => ({
          data: {
            type: 'alert.created',
            unreadCount: (payload as AlertCreatedForUserEvent).unreadCount,
          },
        }),
      ),
    );
  }
}
