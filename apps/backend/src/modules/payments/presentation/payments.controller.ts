import { Permission } from '@casso-ledger/shared-types';
import {
  Body,
  Controller,
  Headers,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  AuditActionType,
  AuditEntityType,
} from '../../../common/audit/audit.enums';
import { Audited } from '../../../common/audit/audited.decorator';
import { ErrorCode } from '../../../common/errors/error-code';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { ApiErrorResponse } from '../../../common/swagger/api-error-response.decorator';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { AllocatePaymentUseCase } from '../application/allocate-payment.usecase';
import { UndoPaymentAllocationUseCase } from '../application/undo-payment-allocation.usecase';
import { AllocatePaymentDto } from './dto/allocate-payment.dto';
import { UndoPaymentAllocationDto } from './dto/undo-payment-allocation.dto';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly allocatePaymentUseCase: AllocatePaymentUseCase,
    private readonly undoPaymentAllocationUseCase: UndoPaymentAllocationUseCase,
    private readonly tenantContext: TenantContextService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post(':id/allocate')
  @ApiOperation({ summary: 'Allocate a payment to a receivable' })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiCreatedResponse({
    description: 'Allocation succeeded',
    schema: {
      type: 'object',
      properties: { success: { type: 'boolean', example: true } },
    },
  })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.PAYMENT_NOT_FOUND,
    ErrorCode.RECEIVABLE_NOT_FOUND,
    ErrorCode.PAYMENT_CUSTOMER_UNRESOLVED,
    ErrorCode.CUSTOMER_MISMATCH,
    ErrorCode.ALLOCATION_EXCEEDS_REMAINING,
    ErrorCode.ALLOCATION_EXCEEDS_UNALLOCATED,
    ErrorCode.CONFLICT,
    ErrorCode.IDEMPOTENCY_KEY_REUSED,
  )
  @UseGuards(PermissionGuard)
  @RequirePermission(Permission.PAYMENT_ALLOCATE)
  @Audited(AuditActionType.PAYMENT_ALLOCATE, AuditEntityType.PAYMENT)
  async allocate(
    @Param('id') paymentId: string,
    @Body() dto: AllocatePaymentDto,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.idempotency.execute(
      `POST /payments/${paymentId}/allocate`,
      key,
      { paymentId, ...dto },
      async () => {
        await this.allocatePaymentUseCase.execute({
          paymentId,
          receivableId: dto.receivableId,
          amount: dto.amount,
          allocatedByUserId:
            this.tenantContext.getCurrentUser()?.userId ?? null,
        });
        return { success: true };
      },
    );
  }

  @Post('allocations/:allocationId/undo')
  @ApiOperation({ summary: 'Undo a payment allocation' })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiCreatedResponse({
    description: 'Allocation undone',
    schema: {
      type: 'object',
      properties: { success: { type: 'boolean', example: true } },
    },
  })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.ALLOCATION_NOT_FOUND,
    ErrorCode.ALLOCATION_ALREADY_UNDONE,
    ErrorCode.PAYMENT_NOT_FOUND,
    ErrorCode.RECEIVABLE_NOT_FOUND,
    ErrorCode.IDEMPOTENCY_KEY_REUSED,
  )
  @UseGuards(PermissionGuard)
  @RequirePermission(Permission.PAYMENT_ALLOCATE_UNDO)
  async undo(
    @Param('allocationId') allocationId: string,
    @Body() dto: UndoPaymentAllocationDto,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.idempotency.execute(
      `POST /payments/allocations/${allocationId}/undo`,
      key,
      { allocationId, ...dto },
      async () => {
        await this.undoPaymentAllocationUseCase.execute({
          allocationId,
          deletedByUserId:
            this.tenantContext.getCurrentUser()?.userId ?? 'system',
          undoReason: dto.undoReason,
        });
        return { success: true };
      },
    );
  }
}
