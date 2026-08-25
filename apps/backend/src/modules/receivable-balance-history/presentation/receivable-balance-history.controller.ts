import { Permission } from '@casso-ar/shared-types';
import { Controller, Get, Header, Query, Res, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { ErrorCode } from '../../../common/errors/error-code';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { ApiErrorResponse } from '../../../common/swagger/api-error-response.decorator';
import { ExportReceivableBalanceHistoryUseCase } from '../application/export-receivable-balance-history.usecase';
import { GetReceivableBalanceHistorySummaryUseCase } from '../application/get-receivable-balance-history-summary.usecase';
import { ListReceivableBalanceHistoryUseCase } from '../application/list-receivable-balance-history.usecase';
import { ReceivableBalanceHistoryQueryDto } from './dto/receivable-balance-history-query.dto';
import {
  ReceivableBalanceHistoryListResponseDto,
  ReceivableBalanceHistorySummaryDto,
  toReceivableBalanceHistoryListResponse,
  toReceivableBalanceHistorySummaryDto,
} from './dto/receivable-balance-history-response.dto';
import { ReceivableBalanceHistoryExportRateLimitGuard } from './receivable-balance-history-export-rate-limit.guard';

@ApiTags('receivable-balance-history')
@Controller('receivable-balance-history')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ReceivableBalanceHistoryController {
  constructor(
    private readonly listUseCase: ListReceivableBalanceHistoryUseCase,
    private readonly summaryUseCase: GetReceivableBalanceHistorySummaryUseCase,
    private readonly exportUseCase: ExportReceivableBalanceHistoryUseCase,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'List receivable balance history transitions with pagination and filters',
  })
  @ApiOkResponse({ type: ReceivableBalanceHistoryListResponseDto })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
  )
  @RequirePermission(Permission.RECEIVABLE_AUDIT_READ)
  async list(@Query() query: ReceivableBalanceHistoryQueryDto) {
    const page = await this.listUseCase.execute({
      filters: {
        receivableId: query.receivableId,
        from: query.from,
        to: query.to,
        status: query.status,
        changeSource: query.changeSource,
      },
      page: query.page,
      limit: query.limit,
    });
    return toReceivableBalanceHistoryListResponse(
      page,
      query.page ?? 1,
      query.limit ?? 20,
    );
  }

  @Get('summary')
  @ApiOperation({
    summary: 'Summarize receivable balance history transitions in a window',
  })
  @ApiOkResponse({ type: ReceivableBalanceHistorySummaryDto })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
  )
  @RequirePermission(Permission.RECEIVABLE_AUDIT_READ)
  async summary(@Query() query: ReceivableBalanceHistoryQueryDto) {
    const summary = await this.summaryUseCase.execute({
      filters: {
        receivableId: query.receivableId,
        from: query.from,
        to: query.to,
        status: query.status,
        changeSource: query.changeSource,
      },
    });
    return toReceivableBalanceHistorySummaryDto(summary);
  }

  @Get('export')
  @ApiOperation({ summary: 'Export receivable balance history as CSV' })
  @ApiOkResponse({
    description:
      'CSV download; may be truncated — X-Export-Truncated: true header signals truncation',
    content: { 'text/csv': { schema: { type: 'string', format: 'binary' } } },
  })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
    ErrorCode.RATE_LIMIT_EXCEEDED,
  )
  @UseGuards(ReceivableBalanceHistoryExportRateLimitGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header(
    'Content-Disposition',
    'attachment; filename="receivable-balance-history.csv"',
  )
  @RequirePermission(Permission.RECEIVABLE_AUDIT_READ)
  async exportCsv(
    @Res() response: Response,
    @Query() query: ReceivableBalanceHistoryQueryDto,
  ) {
    const { csv, truncated } = await this.exportUseCase.execute({
      filters: {
        receivableId: query.receivableId,
        from: query.from,
        to: query.to,
        status: query.status,
        changeSource: query.changeSource,
      },
    });
    if (truncated) {
      response.setHeader('X-Export-Truncated', 'true');
    }
    response.send(csv);
  }
}
