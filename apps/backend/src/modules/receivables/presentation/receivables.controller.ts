import { Permission } from '@casso-ledger/shared-types';
import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  AuditActionType,
  AuditEntityType,
} from '../../../common/audit/audit.enums';
import { Audited } from '../../../common/audit/audited.decorator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { CancelReceivableUseCase } from '../application/cancel-receivable.usecase';
import { CreateReceivableUseCase } from '../application/create-receivable.usecase';
import { ExportReceivablesUseCase } from '../application/export-receivables.usecase';
import { GetReceivableUseCase } from '../application/get-receivable.usecase';
import { ListReceivablesUseCase } from '../application/list-receivables.usecase';
import { WriteOffReceivableUseCase } from '../application/write-off-receivable.usecase';
import { CreateReceivableDto } from './dto/create-receivable.dto';
import {
  toReceivableDetailResponse,
  toReceivableResponse,
} from './dto/receivable-response.dto';
import { toReceivableSummaryResponse } from './dto/receivable-summary-response.dto';

@Controller('receivables')
@UseGuards(PermissionGuard)
export class ReceivablesController {
  constructor(
    private readonly createReceivableUseCase: CreateReceivableUseCase,
    private readonly cancelReceivableUseCase: CancelReceivableUseCase,
    private readonly writeOffReceivableUseCase: WriteOffReceivableUseCase,
    private readonly getReceivableUseCase: GetReceivableUseCase,
    private readonly listReceivablesUseCase: ListReceivablesUseCase,
    private readonly exportReceivablesUseCase: ExportReceivablesUseCase,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="receivables.csv"')
  @RequirePermission(Permission.RECEIVABLE_READ)
  async exportCsv(
    @Res() response: Response,
    @Query('status') status?: string,
    @Query('salesRepresentativeId') salesRepresentativeId?: string,
    @Query('customerId') customerId?: string,
  ) {
    const { csv, truncated } = await this.exportReceivablesUseCase.execute({
      filters: { status, salesRepresentativeId, customerId },
    });
    if (truncated) {
      response.setHeader('X-Export-Truncated', 'true');
    }
    response.send(csv);
  }

  @Get()
  @RequirePermission(Permission.RECEIVABLE_READ)
  async findMany(
    @Query() pagination: PaginationDto,
    @Query('status') status?: string,
    @Query('salesRepresentativeId') salesRepresentativeId?: string,
    @Query('customerId') customerId?: string,
  ) {
    const result = await this.listReceivablesUseCase.execute({
      filters: { status, salesRepresentativeId, customerId },
      page: pagination.page,
      limit: pagination.limit,
    });
    return {
      items: result.items.map((x) =>
        toReceivableSummaryResponse(
          x.receivable,
          x.isOverdue,
          x.isDisputed,
          x.disputeId,
          x.invoiceNumber,
          x.customerName,
        ),
      ),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
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
      result.invoiceNumber,
      result.isOverdue,
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

  @Post(':id/cancel')
  @RequirePermission(Permission.RECEIVABLE_WRITE_OFF)
  @Audited(AuditActionType.RECEIVABLE_CANCEL, AuditEntityType.RECEIVABLE)
  async cancel(
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.idempotency.execute(
      `POST /receivables/${id}/cancel`,
      key,
      { id },
      async () => {
        const receivable = await this.cancelReceivableUseCase.execute(id);
        return toReceivableResponse(receivable);
      },
    );
  }
}
