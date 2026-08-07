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
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service';
import { Permission } from '../../../common/rbac/permission.enum';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { MarkPrepaidBankTransactionUseCase } from '../application/mark-prepaid-bank-transaction.usecase';
import { MatchBankTransactionUseCase } from '../application/match-bank-transaction.usecase';
import { SkipBankTransactionUseCase } from '../application/skip-bank-transaction.usecase';
import { UnmatchedBankTransactionsQueryService } from '../application/unmatched-bank-transactions-query.service';
import { ExceptionQueuePaginationDto } from './dto/exception-queue-pagination.dto';
import {
  toBankTransactionResponse,
  toMatchingCandidateResponse,
  toPaymentResponse,
  toUnmatchedResponse,
} from './dto/exception-queue-response.dto';
import { MarkPrepaidBankTransactionDto } from './dto/mark-prepaid-bank-transaction.dto';
import { MatchBankTransactionDto } from './dto/match-bank-transaction.dto';

@Controller('bank-transactions')
@UseGuards(PermissionGuard)
export class ExceptionQueueController {
  constructor(
    private readonly unmatchedQuery: UnmatchedBankTransactionsQueryService,
    private readonly matchUseCase: MatchBankTransactionUseCase,
    private readonly skipUseCase: SkipBankTransactionUseCase,
    private readonly markPrepaidUseCase: MarkPrepaidBankTransactionUseCase,
    private readonly tenantContext: TenantContextService,
    private readonly idempotency: IdempotencyService,
  ) {}

  private getCurrentUserIdOrThrow(): string {
    const user = this.tenantContext.getCurrentUser();
    if (!user) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Yêu cầu đăng nhập.');
    }
    return user.userId;
  }

  @Get('unmatched')
  @RequirePermission(Permission.PAYMENT_ALLOCATE)
  async unmatched(@Query() query: ExceptionQueuePaginationDto) {
    return toUnmatchedResponse(
      await this.unmatchedQuery.execute(query.page, query.limit),
    );
  }

  @Get('pending-review-count')
  @RequirePermission(Permission.PAYMENT_ALLOCATE)
  async pendingReviewCount() {
    return { count: await this.unmatchedQuery.countPendingReview() };
  }

  @Get(':id/candidates')
  @RequirePermission(Permission.PAYMENT_ALLOCATE)
  async candidates(@Param('id') id: string) {
    const candidates = await this.unmatchedQuery.candidates(id);
    return candidates.map(toMatchingCandidateResponse);
  }

  @Post(':id/match')
  @RequirePermission(Permission.PAYMENT_ALLOCATE)
  @Audited(AuditActionType.PAYMENT_ALLOCATE, AuditEntityType.BANK_TRANSACTION)
  async match(
    @Param('id') id: string,
    @Body() dto: MatchBankTransactionDto,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.idempotency.execute(
      `POST /bank-transactions/${id}/match`,
      key,
      { id, ...dto },
      async () =>
        toBankTransactionResponse(
          await this.matchUseCase.execute({
            bankTransactionId: id,
            allocations: dto.allocations,
            version: dto.version,
            allocatedByUserId: this.getCurrentUserIdOrThrow(),
          }),
        ),
    );
  }

  @Post(':id/skip')
  @RequirePermission(Permission.PAYMENT_ALLOCATE)
  @Audited(
    AuditActionType.BANK_TRANSACTION_SKIP,
    AuditEntityType.BANK_TRANSACTION,
  )
  async skip(
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.idempotency.execute(
      `POST /bank-transactions/${id}/skip`,
      key,
      { id },
      async () => toBankTransactionResponse(await this.skipUseCase.execute(id)),
    );
  }

  @Post(':id/mark-prepaid')
  @RequirePermission(Permission.PAYMENT_ALLOCATE)
  @Audited(
    AuditActionType.BANK_TRANSACTION_MARK_PREPAID,
    AuditEntityType.BANK_TRANSACTION,
  )
  async markPrepaid(
    @Param('id') id: string,
    @Body() dto: MarkPrepaidBankTransactionDto,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.idempotency.execute(
      `POST /bank-transactions/${id}/mark-prepaid`,
      key,
      { id, ...dto },
      async () => {
        const result = await this.markPrepaidUseCase.execute({
          bankTransactionId: id,
          customerId: dto.customerId,
        });
        return {
          transaction: toBankTransactionResponse(result.transaction),
          payment: toPaymentResponse(result.payment),
        };
      },
    );
  }
}
