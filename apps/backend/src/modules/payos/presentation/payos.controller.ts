import { Permission } from '@casso-ledger/shared-types';
import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  AuditActionType,
  AuditEntityType,
} from '../../../common/audit/audit.enums';
import { Audited } from '../../../common/audit/audited.decorator';
import { Public } from '../../../common/auth/public.decorator';
import { ErrorCode } from '../../../common/errors/error-code';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { ApiErrorResponse } from '../../../common/swagger/api-error-response.decorator';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { WebhookRateLimitGuard } from '../../webhooks/presentation/webhook-rate-limit.guard';
import { ConfirmPeriodChargeUseCase } from '../application/confirm-period-charge.usecase';
import { ConfirmPlanUpgradeOrderUseCase } from '../application/confirm-plan-upgrade-order.usecase';
import { InitiatePeriodChargeUseCase } from '../application/initiate-period-charge.usecase';
import { InitiatePlanUpgradeOrderUseCase } from '../application/initiate-plan-upgrade-order.usecase';
import { InitiatePeriodChargeDto } from './dto/initiate-period-charge.dto';
import { InitiatePlanUpgradeOrderDto } from './dto/initiate-plan-upgrade-order.dto';
import { PayosWebhookDto } from './dto/payos-webhook.dto';
import { PeriodChargeResponseDto } from './dto/period-charge-response.dto';
import { PlanUpgradeOrderResponseDto } from './dto/plan-upgrade-order-response.dto';
import { PayosWebhookAuthGuard } from './payos-webhook-auth.guard';

@ApiTags('payos')
@Controller('payos')
@UseGuards(PermissionGuard)
export class PayosController {
  constructor(
    private readonly initiateUseCase: InitiatePlanUpgradeOrderUseCase,
    private readonly confirmUseCase: ConfirmPlanUpgradeOrderUseCase,
    private readonly initiateChargeUseCase: InitiatePeriodChargeUseCase,
    private readonly confirmChargeUseCase: ConfirmPeriodChargeUseCase,
    private readonly tenantContext: TenantContextService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post('plan-upgrade-orders')
  @ApiOperation({ summary: 'Create a PayOS checkout order for a plan upgrade' })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiCreatedResponse({ type: PlanUpgradeOrderResponseDto })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.NOT_FOUND,
    ErrorCode.INVALID_PLAN_TRANSITION,
    ErrorCode.IDEMPOTENCY_KEY_REUSED,
  )
  @Audited(
    AuditActionType.PLAN_UPGRADE_ORDER_CREATE,
    AuditEntityType.PLAN_UPGRADE_ORDER,
  )
  @RequirePermission(Permission.SUBSCRIPTION_MANAGE)
  async initiate(
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: InitiatePlanUpgradeOrderDto,
  ): Promise<PlanUpgradeOrderResponseDto> {
    const organizationId = this.tenantContext.getOrganizationId();
    return this.idempotency.execute(
      'POST /payos/plan-upgrade-orders',
      key,
      dto,
      async () =>
        this.initiateUseCase.execute({
          organizationId,
          targetPlanId: dto.targetPlanId,
          returnUrl: dto.returnUrl,
          cancelUrl: dto.cancelUrl,
        }),
    );
  }

  @Post('period-charges')
  @ApiOperation({
    summary: 'Create a PayOS checkout order for the period charge',
  })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiCreatedResponse({ type: PeriodChargeResponseDto })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.NOT_FOUND,
    ErrorCode.INVALID_PLAN_TRANSITION,
    ErrorCode.IDEMPOTENCY_KEY_REUSED,
  )
  @Audited(AuditActionType.PERIOD_CHARGE_CREATE, AuditEntityType.PERIOD_CHARGE)
  @RequirePermission(Permission.SUBSCRIPTION_MANAGE)
  async initiatePeriodCharge(
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: InitiatePeriodChargeDto,
  ): Promise<PeriodChargeResponseDto> {
    const organizationId = this.tenantContext.getOrganizationId();
    return this.idempotency.execute(
      'POST /payos/period-charges',
      key,
      dto,
      async () =>
        this.initiateChargeUseCase.execute({
          organizationId,
          returnUrl: dto.returnUrl,
          cancelUrl: dto.cancelUrl,
        }),
    );
  }

  @Post('webhook')
  @Public()
  @ApiOperation({ summary: 'Receive a PayOS payment webhook' })
  @ApiOkResponse({
    description: 'Webhook acknowledged',
    schema: {
      type: 'object',
      required: ['received'],
      properties: { received: { type: 'boolean', example: true } },
    },
  })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.RATE_LIMIT_EXCEEDED,
  )
  @UseGuards(PayosWebhookAuthGuard, WebhookRateLimitGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @HttpCode(200)
  async receiveWebhook(
    @Body() payload: PayosWebhookDto,
  ): Promise<{ received: true }> {
    const input = {
      orderCode: payload.data.orderCode,
      paymentSucceeded: payload.code === '00',
    };
    // Both use cases no-op if the orderCode isn't theirs (Task 6's offset
    // makes the two spaces disjoint, so at most one of these ever matches).
    await this.confirmUseCase.execute(input);
    await this.confirmChargeUseCase.execute(input);
    return { received: true };
  }
}
