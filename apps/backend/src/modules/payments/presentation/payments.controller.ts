import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { Permission } from '../../../common/rbac/permission.enum';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
// biome-ignore lint/style/useImportType: must be a value import — NestJS DI resolves this constructor param via emitDecoratorMetadata's design:paramtypes, which erases type-only imports to `Function`
import { TenantContextService } from '../../../common/tenancy/tenant-context';
// biome-ignore lint/style/useImportType: must be a value import — NestJS DI resolves this constructor param via emitDecoratorMetadata's design:paramtypes, which erases type-only imports to `Function`
import { AllocatePaymentUseCase } from '../application/allocate-payment.usecase';
// biome-ignore lint/style/useImportType: must be a value import — NestJS DI resolves this constructor param via emitDecoratorMetadata's design:paramtypes, which erases type-only imports to `Function`
import { UndoPaymentAllocationUseCase } from '../application/undo-payment-allocation.usecase';
// biome-ignore lint/style/useImportType: must be a value import — Nest's ValidationPipe resolves the @Body() DTO's metatype via emitDecoratorMetadata's design:paramtypes, which erases type-only imports to `Object`, silently disabling validation/transform (confirmed live: request bodies bound to this DTO came through as `undefined`)
import { AllocatePaymentDto } from './dto/allocate-payment.dto';
// biome-ignore lint/style/useImportType: must be a value import — same reason as AllocatePaymentDto above
import { UndoPaymentAllocationDto } from './dto/undo-payment-allocation.dto';

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly allocatePaymentUseCase: AllocatePaymentUseCase,
    private readonly undoPaymentAllocationUseCase: UndoPaymentAllocationUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Post(':id/allocate')
  @UseGuards(PermissionGuard)
  @RequirePermission(Permission.PAYMENT_ALLOCATE)
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
  @UseGuards(PermissionGuard)
  @RequirePermission(Permission.PAYMENT_ALLOCATE_UNDO)
  async undo(
    @Param('allocationId') allocationId: string,
    @Body() dto: UndoPaymentAllocationDto,
  ) {
    await this.undoPaymentAllocationUseCase.execute({
      allocationId,
      deletedByUserId: this.tenantContext.getCurrentUser()?.userId ?? 'system',
      undoReason: dto.undoReason,
    });
    return { success: true };
  }
}
