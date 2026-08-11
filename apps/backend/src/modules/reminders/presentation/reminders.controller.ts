import { Permission } from '@casso-ledger/shared-types';
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  AuditActionType,
  AuditEntityType,
} from '../../../common/audit/audit.enums';
import { Audited } from '../../../common/audit/audited.decorator';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { ReminderExecutionQueryService } from '../application/reminder-execution-query.service';
import { ReminderPolicyService } from '../application/reminder-policy.service';
import { CreateReminderPolicyDto } from './dto/create-reminder-policy.dto';
import { ListReminderExecutionsQuery } from './dto/list-reminder-executions.query';
import { UpdateReminderPolicyDto } from './dto/update-reminder-policy.dto';

@Controller('reminder-policies')
export class RemindersController {
  constructor(private readonly policyService: ReminderPolicyService) {}

  @Post()
  @RequirePermission(Permission.REMINDER_POLICY_WRITE)
  async create(@Body() dto: CreateReminderPolicyDto) {
    return this.policyService.create(dto);
  }

  @Get()
  @RequirePermission(Permission.REPORT_READ)
  async list() {
    return this.policyService.list();
  }

  @Patch(':id')
  @RequirePermission(Permission.REMINDER_POLICY_WRITE)
  @Audited(
    AuditActionType.REMINDER_POLICY_UPDATE,
    AuditEntityType.REMINDER_POLICY,
  )
  async update(@Param('id') id: string, @Body() dto: UpdateReminderPolicyDto) {
    return this.policyService.update(id, dto);
  }
}

@Controller('reminder-executions')
export class ReminderExecutionsController {
  constructor(
    private readonly executionQueryService: ReminderExecutionQueryService,
  ) {}

  @Get()
  @RequirePermission(Permission.REPORT_READ)
  async list(@Query() query: ListReminderExecutionsQuery) {
    return this.executionQueryService.list({
      receivableId: query.receivableId,
      status: query.status,
      page: query.page,
      limit: query.limit,
    });
  }
}
