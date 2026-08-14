import { Permission } from '@casso-ledger/shared-types';
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  AuditActionType,
  AuditEntityType,
} from '../../../common/audit/audit.enums';
import { Audited } from '../../../common/audit/audited.decorator';
import { ErrorCode } from '../../../common/errors/error-code';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { ApiErrorResponse } from '../../../common/swagger/api-error-response.decorator';
import { ReminderExecutionQueryService } from '../application/reminder-execution-query.service';
import { ReminderPolicyService } from '../application/reminder-policy.service';
import { CreateReminderPolicyDto } from './dto/create-reminder-policy.dto';
import { ListReminderExecutionsQueryDto } from './dto/list-reminder-executions-query.dto';
import {
  ListReminderExecutionsResponseDto,
  toReminderExecutionResponse,
} from './dto/reminder-execution-response.dto';
import {
  ReminderPolicyResponseDto,
  toReminderPolicyResponse,
} from './dto/reminder-policy-response.dto';
import { UpdateReminderPolicyDto } from './dto/update-reminder-policy.dto';

@ApiTags('reminders')
@Controller('reminder-policies')
@UseGuards(PermissionGuard)
export class RemindersController {
  constructor(private readonly policyService: ReminderPolicyService) {}

  @Post()
  @ApiOperation({ summary: 'Create a reminder policy' })
  @ApiCreatedResponse({ type: ReminderPolicyResponseDto })
  @ApiErrorResponse(ErrorCode.VALIDATION_ERROR, ErrorCode.CONFLICT)
  @RequirePermission(Permission.REMINDER_POLICY_WRITE)
  async create(@Body() dto: CreateReminderPolicyDto) {
    return toReminderPolicyResponse(await this.policyService.create(dto));
  }

  @Get()
  @ApiOperation({ summary: 'List reminder policies' })
  @ApiOkResponse({ type: [ReminderPolicyResponseDto] })
  @RequirePermission(Permission.REPORT_READ)
  async list() {
    return (await this.policyService.list()).map(toReminderPolicyResponse);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a reminder policy' })
  @ApiOkResponse({ type: ReminderPolicyResponseDto })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.NOT_FOUND,
    ErrorCode.CONFLICT,
  )
  @RequirePermission(Permission.REMINDER_POLICY_WRITE)
  @Audited(
    AuditActionType.REMINDER_POLICY_UPDATE,
    AuditEntityType.REMINDER_POLICY,
  )
  async update(@Param('id') id: string, @Body() dto: UpdateReminderPolicyDto) {
    return toReminderPolicyResponse(await this.policyService.update(id, dto));
  }
}

@ApiTags('reminders')
@Controller('reminder-executions')
@UseGuards(PermissionGuard)
export class ReminderExecutionsController {
  constructor(
    private readonly executionQueryService: ReminderExecutionQueryService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List reminder executions with pagination' })
  @ApiOkResponse({ type: ListReminderExecutionsResponseDto })
  @ApiErrorResponse(ErrorCode.VALIDATION_ERROR)
  @RequirePermission(Permission.REPORT_READ)
  async list(@Query() query: ListReminderExecutionsQueryDto) {
    const result = await this.executionQueryService.list({
      receivableId: query.receivableId,
      status: query.status,
      page: query.page,
      limit: query.limit,
    });
    return {
      items: result.items.map(toReminderExecutionResponse),
      total: result.total,
      page: query.page,
      limit: query.limit,
    };
  }
}
