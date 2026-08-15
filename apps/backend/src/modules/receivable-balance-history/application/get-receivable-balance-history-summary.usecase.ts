import type { ReceivableStatus } from '@casso-ledger/shared-types';
import { Inject, Injectable } from '@nestjs/common';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { BalanceHistoryActorType } from '../domain/balance-history-actor-type';
import type { BalanceHistoryChangeSource } from '../domain/balance-history-change-source';
import {
  type IReceivableBalanceHistoryQuery,
  RECEIVABLE_BALANCE_HISTORY_QUERY,
  type ReceivableBalanceHistoryListFilters,
  type ReceivableBalanceHistorySummary,
} from './receivable-balance-history-query.port';

const REPORTING_TIMEZONE = 'Asia/Ho_Chi_Minh';
const DEFAULT_DAYS = 30;

export interface GetReceivableBalanceHistorySummaryInput {
  filters: {
    receivableId?: string;
    from?: string; // YYYY-MM-DD local date, inclusive
    to?: string; // YYYY-MM-DD local date, inclusive
    status?: ReceivableStatus;
    changeSource?: BalanceHistoryChangeSource;
    actorType?: BalanceHistoryActorType;
  };
}

function startOfDay(localDate: string): Date {
  return fromZonedTime(`${localDate}T00:00:00`, REPORTING_TIMEZONE);
}

function endOfDay(localDate: string): Date {
  return fromZonedTime(`${localDate}T23:59:59.999`, REPORTING_TIMEZONE);
}

function defaultWindow(): { from: Date; to: Date } {
  const today = formatInTimeZone(new Date(), REPORTING_TIMEZONE, 'yyyy-MM-dd');
  const fromDate = new Date(today);
  fromDate.setDate(fromDate.getDate() - (DEFAULT_DAYS - 1));
  return {
    from: startOfDay(
      formatInTimeZone(fromDate, REPORTING_TIMEZONE, 'yyyy-MM-dd'),
    ),
    to: endOfDay(today),
  };
}

@Injectable()
export class GetReceivableBalanceHistorySummaryUseCase {
  constructor(
    @Inject(RECEIVABLE_BALANCE_HISTORY_QUERY)
    private readonly historyQuery: IReceivableBalanceHistoryQuery,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(
    input: GetReceivableBalanceHistorySummaryInput,
  ): Promise<ReceivableBalanceHistorySummary> {
    const organizationId = this.tenantContext.getOrganizationId();
    const filters: ReceivableBalanceHistoryListFilters = {
      receivableId: input.filters.receivableId,
      status: input.filters.status,
      changeSource: input.filters.changeSource,
      actorType: input.filters.actorType,
    };
    if (input.filters.from && input.filters.to) {
      filters.from = startOfDay(input.filters.from);
      filters.to = endOfDay(input.filters.to);
    } else if (input.filters.from || input.filters.to) {
      filters.from = input.filters.from
        ? startOfDay(input.filters.from)
        : undefined;
      filters.to = input.filters.to ? endOfDay(input.filters.to) : undefined;
    } else {
      const { from, to } = defaultWindow();
      filters.from = from;
      filters.to = to;
    }

    return this.historyQuery.summarize(organizationId, filters);
  }
}
