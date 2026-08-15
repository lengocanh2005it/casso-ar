import type { ReceivableStatus } from '@casso-ledger/shared-types';
import { Inject, Injectable } from '@nestjs/common';
import { fromZonedTime } from 'date-fns-tz';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { BalanceHistoryActorType } from '../domain/balance-history-actor-type';
import type { BalanceHistoryChangeSource } from '../domain/balance-history-change-source';
import {
  type IReceivableBalanceHistoryQuery,
  RECEIVABLE_BALANCE_HISTORY_QUERY,
  type ReceivableBalanceHistoryListFilters,
  type ReceivableBalanceHistoryListPage,
} from './receivable-balance-history-query.port';

const REPORTING_TIMEZONE = 'Asia/Ho_Chi_Minh';
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export interface ListReceivableBalanceHistoryInput {
  filters: {
    receivableId?: string;
    from?: string; // YYYY-MM-DD local date, inclusive
    to?: string; // YYYY-MM-DD local date, inclusive
    status?: ReceivableStatus;
    changeSource?: BalanceHistoryChangeSource;
    actorType?: BalanceHistoryActorType;
  };
  page?: number;
  limit?: number;
}

function localDateToInstant(localDate: string, endOfDay: boolean): Date {
  return fromZonedTime(
    `${localDate}T${endOfDay ? '23:59:59.999' : '00:00:00'}`,
    REPORTING_TIMEZONE,
  );
}

@Injectable()
export class ListReceivableBalanceHistoryUseCase {
  constructor(
    @Inject(RECEIVABLE_BALANCE_HISTORY_QUERY)
    private readonly historyQuery: IReceivableBalanceHistoryQuery,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(
    input: ListReceivableBalanceHistoryInput,
  ): Promise<ReceivableBalanceHistoryListPage> {
    const organizationId = this.tenantContext.getOrganizationId();
    const filters: ReceivableBalanceHistoryListFilters = {
      receivableId: input.filters.receivableId,
      from: input.filters.from
        ? localDateToInstant(input.filters.from, false)
        : undefined,
      to: input.filters.to
        ? localDateToInstant(input.filters.to, true)
        : undefined,
      status: input.filters.status,
      changeSource: input.filters.changeSource,
      actorType: input.filters.actorType,
    };
    const page = Math.max(1, input.page ?? DEFAULT_PAGE);
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, input.limit ?? DEFAULT_LIMIT),
    );

    return this.historyQuery.list(organizationId, filters, page, limit);
  }
}
