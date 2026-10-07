import { Permission } from '@casso-ar/shared-types';
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { ErrorCode } from '../../../common/errors/error-code';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { ApiErrorResponse } from '../../../common/swagger/api-error-response.decorator';
import type { ArReconciliationCursor } from '../application/ar-reconciliation-query.port';
import { ReconcileArBalancesUseCase } from '../application/reconcile-ar-balances.usecase';
import { LedgerEventSubjectType } from '../domain/ledger-event-subject-type';
import { ArReconciliationQueryDto } from './dto/ar-reconciliation-query.dto';
import { ArReconciliationResponseDto } from './dto/ar-reconciliation-response.dto';

const RECEIVABLE_CURSOR_PREFIX = `${LedgerEventSubjectType.RECEIVABLE}:`;
const PAYMENT_CURSOR_PREFIX = `${LedgerEventSubjectType.PAYMENT}:`;

function parseCursor(value?: string): ArReconciliationCursor | null {
  if (!value) return null;

  if (value.startsWith(RECEIVABLE_CURSOR_PREFIX)) {
    return {
      subjectType: LedgerEventSubjectType.RECEIVABLE,
      subjectId: value.slice(RECEIVABLE_CURSOR_PREFIX.length),
    };
  }

  if (value.startsWith(PAYMENT_CURSOR_PREFIX)) {
    return {
      subjectType: LedgerEventSubjectType.PAYMENT,
      subjectId: value.slice(PAYMENT_CURSOR_PREFIX.length),
    };
  }

  return null;
}

function serializeCursor(cursor: ArReconciliationCursor | null): string | null {
  return cursor ? `${cursor.subjectType}:${cursor.subjectId}` : null;
}

@ApiTags('ledger')
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('ledger/reconciliation')
export class LedgerReconciliationController {
  constructor(private readonly reconcile: ReconcileArBalancesUseCase) {}

  @Get()
  @RequirePermission(Permission.RECEIVABLE_AUDIT_READ)
  @ApiOperation({
    summary:
      'Reconcile receivable and payment balances with allocations and the AR ledger',
  })
  @ApiOkResponse({ type: ArReconciliationResponseDto })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
  )
  async get(@Query() query: ArReconciliationQueryDto) {
    const result = await this.reconcile.execute({
      cursor: parseCursor(query.cursor),
      limit: query.limit,
    });

    return {
      findings: result.findings.map((finding) => ({
        subjectType: finding.subjectType,
        subjectId: finding.subjectId,
        code: finding.code,
        storedValue: finding.storedValue,
        expectedValue: finding.expectedValue,
        delta: finding.delta,
      })),
      nextCursor: serializeCursor(result.nextCursor),
      complete: result.complete,
    };
  }
}
