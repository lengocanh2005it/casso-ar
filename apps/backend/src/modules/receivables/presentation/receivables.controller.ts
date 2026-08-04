import {
  Body,
  Controller,
  Headers,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { IdempotencyService } from '../../../common/idempotency/idempotency.service';
import { Permission } from '../../../common/rbac/permission.enum';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
// biome-ignore lint/style/useImportType: must be a value import — NestJS DI resolves this constructor param via emitDecoratorMetadata's design:paramtypes, which erases type-only imports to `Function`
import { CreateReceivableUseCase } from '../application/create-receivable.usecase';
// biome-ignore lint/style/useImportType: must be a value import — NestJS DI resolves this constructor param via emitDecoratorMetadata's design:paramtypes, which erases type-only imports to `Function`
import { WriteOffReceivableUseCase } from '../application/write-off-receivable.usecase';
// biome-ignore lint/style/useImportType: must be a value import — Nest's ValidationPipe resolves the @Body() DTO's metatype via emitDecoratorMetadata's design:paramtypes, which erases type-only imports to `Object`, silently disabling validation/transform (confirmed live: request bodies bound to this DTO came through as `undefined`)
import { CreateReceivableDto } from './dto/create-receivable.dto';
import { toReceivableResponse } from './dto/receivable-response.dto';

@Controller('receivables')
@UseGuards(PermissionGuard)
export class ReceivablesController {
  constructor(
    private readonly createReceivableUseCase: CreateReceivableUseCase,
    private readonly writeOffReceivableUseCase: WriteOffReceivableUseCase,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post()
  @RequirePermission(Permission.RECEIVABLE_WRITE)
  async create(
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: CreateReceivableDto,
  ) {
    return this.idempotency.execute('POST /receivables', key, dto, async () => {
      const receivable = await this.createReceivableUseCase.execute({
        customerId: dto.customerId,
        invoiceId: dto.invoiceId ?? null,
        originalAmount: dto.originalAmount,
        dueDate: new Date(dto.dueDate),
        salesRepresentativeId: dto.salesRepresentativeId ?? null,
      });
      return toReceivableResponse(receivable);
    });
  }

  @Post(':id/write-off')
  @RequirePermission(Permission.RECEIVABLE_WRITE_OFF)
  async writeOff(
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.idempotency.execute(
      `POST /receivables/${id}/write-off`,
      key,
      { id },
      async () => {
        const receivable = await this.writeOffReceivableUseCase.execute(id);
        return toReceivableResponse(receivable);
      },
    );
  }
}
