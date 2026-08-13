import { Permission } from '@casso-ledger/shared-types';
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { ListAlertsUseCase } from '../application/list-alerts.usecase';
import { toAlertsPageResponse } from './dto/alert-response.dto';
import { AlertsPaginationDto } from './dto/alerts-pagination.dto';

@Controller('alerts')
@UseGuards(PermissionGuard)
export class AlertsController {
  constructor(private readonly listAlerts: ListAlertsUseCase) {}

  @Get()
  @RequirePermission(Permission.ALERT_READ)
  async list(@Query() query: AlertsPaginationDto) {
    return toAlertsPageResponse(
      await this.listAlerts.execute(query.page, query.limit, query.unreadOnly),
    );
  }
}
