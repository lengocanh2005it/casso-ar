import { Permission } from '@casso-ledger/shared-types';
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  AuditActionType,
  AuditEntityType,
} from '../../../common/audit/audit.enums';
import { Audited } from '../../../common/audit/audited.decorator';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { ChangeSubscriptionPlanUseCase } from '../application/change-subscription-plan.usecase';
import { ChangeSubscriptionPlanDto } from './dto/change-subscription-plan.dto';
import { toSubscriptionResponse } from './dto/subscription-response.dto';

@Controller('subscriptions')
@UseGuards(PermissionGuard)
export class BillingController {
  constructor(
    private readonly changePlanUseCase: ChangeSubscriptionPlanUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Post('change-plan')
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
