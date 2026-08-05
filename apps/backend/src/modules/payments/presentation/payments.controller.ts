import {
  Body,
  Controller,
  Headers,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service';
import { Permission } from '../../../common/rbac/permission.enum';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { AllocatePaymentUseCase } from '../application/allocate-payment.usecase';
import { UndoPaymentAllocationUseCase } from '../application/undo-payment-allocation.usecase';
import { AllocatePaymentDto } from './dto/allocate-payment.dto';
import { UndoPaymentAllocationDto } from './dto/undo-payment-allocation.dto';

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly allocatePaymentUseCase: AllocatePaymentUseCase,
    private readonly undoPaymentAllocationUseCase: UndoPaymentAllocationUseCase,
    private readonly tenantContext: TenantContextService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post(':id/allocate')
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
