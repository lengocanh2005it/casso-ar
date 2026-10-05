import { Permission } from '@casso-ar/shared-types';
import {
  Body,
  Controller,
  Headers,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { ApiErrorResponse } from '../../../common/swagger/api-error-response.decorator';
import { ApiIdempotencyKey } from '../../../common/swagger/api-idempotency-key.decorator';
import { successResponseSchema } from '../../../common/swagger/success-response-schema';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { BalanceHistoryActorType } from '../../receivable-balance-history/domain/balance-history-actor-type';
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
  @ApiIdempotencyKey()
  @ApiCreatedResponse({
    description: 'Allocation succeeded',
    schema: successResponseSchema(),
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
        const user = this.tenantContext.getCurrentUser();
        if (!user) {
          throw new AppError(ErrorCode.UNAUTHORIZED, 'Yêu cầu đăng nhập.');
        }
        await this.allocatePaymentUseCase.execute({
          paymentId,
          receivableId: dto.receivableId,
          amount: dto.amount,
          allocatedByUserId: user.userId,
          provenance: {
            actorType: BalanceHistoryActorType.USER,
            actorUserId: user.userId,
          },
        });
        return { success: true };
      },
    );
  }

  @Post('allocations/:allocationId/undo')
  @ApiOperation({ summary: 'Undo a payment allocation' })
  @ApiIdempotencyKey()
  @ApiCreatedResponse({
    description: 'Allocation undone',
    schema: successResponseSchema(),
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
        const user = this.tenantContext.getCurrentUser();
        if (!user) {
          throw new AppError(ErrorCode.UNAUTHORIZED, 'Yêu cầu đăng nhập.');
        }
        await this.undoPaymentAllocationUseCase.execute({
          allocationId,
          deletedByUserId: user.userId,
          undoReason: dto.undoReason,
        });
        return { success: true };
      },
    );
  }
}
