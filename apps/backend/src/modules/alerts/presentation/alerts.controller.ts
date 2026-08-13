import { Permission } from '@casso-ledger/shared-types';
import {
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { ListAlertsUseCase } from '../application/list-alerts.usecase';
import { MarkAlertReadUseCase } from '../application/mark-alert-read.usecase';
import { MarkAllAlertsReadUseCase } from '../application/mark-all-alerts-read.usecase';
import { toAlertsPageResponse } from './dto/alert-response.dto';
import { AlertsPaginationDto } from './dto/alerts-pagination.dto';

@Controller('alerts')
@UseGuards(PermissionGuard)
export class AlertsController {
  constructor(
    private readonly listAlerts: ListAlertsUseCase,
    private readonly markAlertRead: MarkAlertReadUseCase,
    private readonly markAllAlertsRead: MarkAllAlertsReadUseCase,
  ) {}

  @Get()
  @RequirePermission(Permission.ALERT_READ)
  async list(@Query() query: AlertsPaginationDto) {
    return toAlertsPageResponse(
      await this.listAlerts.execute(query.page, query.limit, query.unreadOnly),
    );
  }

  @Patch(':id/read')
  @RequirePermission(Permission.ALERT_READ)
  async read(@Param('id') id: string) {
    await this.markAlertRead.execute(id);
    return { success: true };
  }

  @Patch('read-all')
  @RequirePermission(Permission.ALERT_READ)
  async readAll() {
    await this.markAllAlertsRead.execute();
    return { success: true };
  }
}
