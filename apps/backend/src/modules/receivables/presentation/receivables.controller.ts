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
import {
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
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
import { CancelReceivableUseCase } from '../application/cancel-receivable.usecase';
import { CreateReceivableUseCase } from '../application/create-receivable.usecase';
import { ExportReceivablesUseCase } from '../application/export-receivables.usecase';
import { GetReceivableUseCase } from '../application/get-receivable.usecase';
import { ListReceivablesUseCase } from '../application/list-receivables.usecase';
import { WriteOffReceivableUseCase } from '../application/write-off-receivable.usecase';
import { CreateReceivableDto } from './dto/create-receivable.dto';
import { ListReceivablesQueryDto } from './dto/list-receivables-query.dto';
import { ListReceivablesResponseDto } from './dto/list-receivables-response.dto';
import {
  ReceivableDetailResponseDto,
  ReceivableResponseDto,
  toReceivableDetailResponse,
  toReceivableResponse,
} from './dto/receivable-response.dto';
import { toReceivableSummaryResponse } from './dto/receivable-summary-response.dto';

@ApiTags('receivables')
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
  @ApiOperation({ summary: 'Export receivables as CSV' })
  @ApiOkResponse({
    description:
      'CSV download; may be truncated — X-Export-Truncated: true header signals truncation',
    content: { 'text/csv': { schema: { type: 'string', format: 'binary' } } },
  })
  @ApiErrorResponse(ErrorCode.VALIDATION_ERROR)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="receivables.csv"')
  @RequirePermission(Permission.RECEIVABLE_READ)
  async exportCsv(
    @Res() response: Response,
    @Query() query: ListReceivablesQueryDto,
  ) {
    const { csv, truncated } = await this.exportReceivablesUseCase.execute({
      filters: {
        status: query.status,
        salesRepresentativeId: query.salesRepresentativeId,
        customerId: query.customerId,
      },
      search: query.search,
    });
    if (truncated) {
      response.setHeader('X-Export-Truncated', 'true');
    }
    response.send(csv);
  }

  @Get()
  @ApiOperation({ summary: 'List receivables with pagination and filters' })
  @ApiOkResponse({ type: ListReceivablesResponseDto })
  @ApiErrorResponse(ErrorCode.VALIDATION_ERROR)
  @RequirePermission(Permission.RECEIVABLE_READ)
  async findMany(@Query() query: ListReceivablesQueryDto) {
    const result = await this.listReceivablesUseCase.execute({
      filters: {
        status: query.status,
        salesRepresentativeId: query.salesRepresentativeId,
        customerId: query.customerId,
      },
      search: query.search,
      page: query.page,
      limit: query.limit,
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
  @ApiOperation({ summary: 'Create a receivable' })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiCreatedResponse({ type: ReceivableResponseDto })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.NOT_FOUND,
    ErrorCode.PLAN_LIMIT_EXCEEDED,
    ErrorCode.IDEMPOTENCY_KEY_REUSED,
  )
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
  @ApiOperation({ summary: 'Get a receivable by id' })
  @ApiOkResponse({ type: ReceivableDetailResponseDto })
  @ApiErrorResponse(ErrorCode.RECEIVABLE_NOT_FOUND)
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
  @ApiOperation({ summary: 'Write off a receivable' })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiCreatedResponse({ type: ReceivableResponseDto })
  @ApiErrorResponse(
    ErrorCode.RECEIVABLE_NOT_FOUND,
    ErrorCode.IDEMPOTENCY_KEY_REUSED,
  )
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
  @ApiOperation({ summary: 'Cancel a receivable' })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiCreatedResponse({ type: ReceivableResponseDto })
  @ApiErrorResponse(
    ErrorCode.RECEIVABLE_NOT_FOUND,
    ErrorCode.RECEIVABLE_HAS_PAYMENTS,
    ErrorCode.CONFLICT,
    ErrorCode.IDEMPOTENCY_KEY_REUSED,
  )
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
