import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  AuditActionType,
  AuditEntityType,
} from '../../../common/audit/audit.enums';
import { Audited } from '../../../common/audit/audited.decorator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service';
import { Permission } from '../../../common/rbac/permission.enum';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { CreateReceivableUseCase } from '../application/create-receivable.usecase';
import { GetReceivableUseCase } from '../application/get-receivable.usecase';
import { ListReceivablesUseCase } from '../application/list-receivables.usecase';
import { WriteOffReceivableUseCase } from '../application/write-off-receivable.usecase';
import { CreateReceivableDto } from './dto/create-receivable.dto';
import {
  toReceivableDetailResponse,
  toReceivableResponse,
} from './dto/receivable-response.dto';

@Controller('receivables')
@UseGuards(PermissionGuard)
export class ReceivablesController {
  constructor(
    private readonly createReceivableUseCase: CreateReceivableUseCase,
    private readonly writeOffReceivableUseCase: WriteOffReceivableUseCase,
    private readonly getReceivableUseCase: GetReceivableUseCase,
    private readonly listReceivablesUseCase: ListReceivablesUseCase,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Get()
  @RequirePermission(Permission.RECEIVABLE_READ)
  async findMany(
    @Query() pagination: PaginationDto,
    @Query('status') status?: string,
    @Query('salesRepresentativeId') salesRepresentativeId?: string,
  ) {
    return this.listReceivablesUseCase.execute({
      filters: { status, salesRepresentativeId },
      page: pagination.page,
      limit: pagination.limit,
    });
  }

  @Post()
  @RequirePermission(Permission.RECEIVABLE_WRITE)
  @Audited(AuditActionType.RECEIVABLE_CREATE, AuditEntityType.RECEIVABLE)
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

  @Get(':id')
  @RequirePermission(Permission.RECEIVABLE_READ)
  async findOne(@Param('id') id: string) {
    const result = await this.getReceivableUseCase.execute(id);
    return toReceivableDetailResponse(
      result.receivable,
      result.isDisputed,
      result.disputeId,
      result.allocations,
    );
  }

  @Post(':id/write-off')
  @RequirePermission(Permission.RECEIVABLE_WRITE_OFF)
  @Audited(AuditActionType.RECEIVABLE_WRITE_OFF, AuditEntityType.RECEIVABLE)
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
