import { Permission } from '@casso-ledger/shared-types';
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AuditActionType,
  AuditEntityType,
} from '../../../common/audit/audit.enums';
import { Audited } from '../../../common/audit/audited.decorator';
import { ErrorCode } from '../../../common/errors/error-code';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { ApiErrorResponse } from '../../../common/swagger/api-error-response.decorator';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { ChangeSubscriptionPlanUseCase } from '../application/change-subscription-plan.usecase';
import { ChangeSubscriptionPlanDto } from './dto/change-subscription-plan.dto';
import {
  SubscriptionResponseDto,
  toSubscriptionResponse,
} from './dto/subscription-response.dto';

@ApiTags('billing')
@Controller('subscriptions')
@UseGuards(PermissionGuard)
export class BillingController {
  constructor(
    private readonly changePlanUseCase: ChangeSubscriptionPlanUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Post('change-plan')
  @ApiOperation({ summary: 'Change the organization subscription plan' })
  @ApiCreatedResponse({ type: SubscriptionResponseDto })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.NOT_FOUND,
    ErrorCode.INVALID_PLAN_TRANSITION,
  )
  @Audited(
    AuditActionType.SUBSCRIPTION_CHANGE_PLAN,
    AuditEntityType.SUBSCRIPTION,
  )
  @RequirePermission(Permission.SUBSCRIPTION_MANAGE)
  async changePlan(@Body() dto: ChangeSubscriptionPlanDto) {
    const organizationId = this.tenantContext.getOrganizationId();
    const subscription = await this.changePlanUseCase.execute(
      organizationId,
      dto.planId,
    );
    return toSubscriptionResponse(subscription);
  }
}
