import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Permission } from '../../../common/rbac/permission.enum';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { ReminderPolicyService } from '../application/reminder-policy.service';
import { CreateReminderPolicyDto } from './dto/create-reminder-policy.dto';
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
  async update(@Param('id') id: string, @Body() dto: UpdateReminderPolicyDto) {
    return this.policyService.update(id, dto);
  }
}
