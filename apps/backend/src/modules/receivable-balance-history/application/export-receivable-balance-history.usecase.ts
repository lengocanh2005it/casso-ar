import { Inject, Injectable } from '@nestjs/common';
import {
  AuditActionType,
  AuditEntityType,
} from '../../../common/audit/audit.enums';
import { AuditLog } from '../../../common/audit/audit-log';
import {
  AUDIT_LOG_REPOSITORY,
  type IAuditLogRepository,
} from '../../../common/audit/audit-log-repository.port';
import { toCsv } from '../../../common/csv/csv-writer';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { resolveDateFilters } from './receivable-balance-history-date-filters';
import {
  type IReceivableBalanceHistoryQuery,
  RECEIVABLE_BALANCE_HISTORY_QUERY,
  type ReceivableBalanceHistoryFilterInput,
  type ReceivableBalanceHistoryListFilters,
} from './receivable-balance-history-query.port';

export interface ExportReceivableBalanceHistoryInput {
  filters: ReceivableBalanceHistoryFilterInput;
}

export const EXPORT_ROW_LIMIT = 10_000;

@Injectable()
export class ExportReceivableBalanceHistoryUseCase {
  constructor(
    @Inject(RECEIVABLE_BALANCE_HISTORY_QUERY)
    private readonly historyQuery: IReceivableBalanceHistoryQuery,
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly auditLogRepo: IAuditLogRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(
    input: ExportReceivableBalanceHistoryInput,
  ): Promise<{ csv: string; truncated: boolean }> {
    const organizationId = this.tenantContext.getOrganizationId();
    const user = this.tenantContext.getCurrentUser();
    if (!user) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Yêu cầu đăng nhập.');
    }

    const dates = resolveDateFilters(input.filters);
    const filters: ReceivableBalanceHistoryListFilters = {
      receivableId: input.filters.receivableId,
      from: dates.from,
      to: dates.to,
      status: input.filters.status,
      changeSource: input.filters.changeSource,
    };
    const { items, total } = await this.historyQuery.list(
      organizationId,
      filters,
      1,
      EXPORT_ROW_LIMIT,
    );
    const truncated = total > EXPORT_ROW_LIMIT;

    const csv = toCsv(
      [
        'Thời điểm hiệu lực',
        'Mã hóa đơn',
        'Khách hàng',
        'Trạng thái',
        'Số tiền còn lại',
        'Nguồn thay đổi',
        'Lý do',
        'Loại tác nhân',
        'Mã người dùng tác động',
        'Tác nhân',
        'Tham chiếu',
        'Ghi chú',
      ],
      items.map((item) => [
        item.effectiveAt.toISOString(),
        item.invoiceNumber ?? '',
        item.customerName ?? '',
        item.status,
        String(item.remainingAmount),
        item.changeSource,
        item.reasonCode ?? '',
        item.actorType ?? '',
        item.actorUserId ?? '',
        item.actorDisplayName ?? '',
        item.transitionReferenceId ?? '',
        item.note ?? '',
      ]),
    );

    await this.auditLogRepo.create(
      new AuditLog({
        organizationId,
        userId: user.userId,
        actionType: AuditActionType.RECEIVABLE_BALANCE_HISTORY_EXPORT,
        entityType: AuditEntityType.RECEIVABLE_BALANCE_HISTORY,
        entityId: organizationId,
        beforeState: null,
        afterState: {
          filters: {
            receivableId: input.filters.receivableId ?? null,
            from: input.filters.from ?? null,
            to: input.filters.to ?? null,
            status: input.filters.status ?? null,
            changeSource: input.filters.changeSource ?? null,
          },
          truncated,
          rowCount: items.length,
        },
        ipAddress: null,
        createdAt: new Date(),
      }),
    );

    return { csv, truncated };
  }
}
