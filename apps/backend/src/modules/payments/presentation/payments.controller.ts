import { Body, Controller, Param, Post } from '@nestjs/common';
import type { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { AllocatePaymentUseCase } from '../application/allocate-payment.usecase';
import type { UndoPaymentAllocationUseCase } from '../application/undo-payment-allocation.usecase';
import type { AllocatePaymentDto } from './dto/allocate-payment.dto';
import type { UndoPaymentAllocationDto } from './dto/undo-payment-allocation.dto';

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly allocatePaymentUseCase: AllocatePaymentUseCase,
    private readonly undoPaymentAllocationUseCase: UndoPaymentAllocationUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Post(':id/allocate')
  async allocate(
    @Param('id') paymentId: string,
    @Body() dto: AllocatePaymentDto,
  ) {
    await this.allocatePaymentUseCase.execute({
      paymentId,
      receivableId: dto.receivableId,
      amount: dto.amount,
      allocatedByUserId: this.tenantContext.getCurrentUser()?.userId ?? null,
    });
    return { success: true };
  }

  @Post('allocations/:allocationId/undo')
  async undo(
    @Param('allocationId') allocationId: string,
    @Body() dto: UndoPaymentAllocationDto,
  ) {
    await this.undoPaymentAllocationUseCase.execute({
      allocationId,
      deletedByUserId: 'system',
      undoReason: dto.undoReason,
    });
    return { success: true };
  }
}
