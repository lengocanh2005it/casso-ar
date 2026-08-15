import { Inject, Injectable } from '@nestjs/common';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { resolveDateFilters } from './receivable-balance-history-date-filters';
import {
  type IReceivableBalanceHistoryQuery,
  RECEIVABLE_BALANCE_HISTORY_QUERY,
  type ReceivableBalanceHistoryFilterInput,
  type ReceivableBalanceHistoryListFilters,
  type ReceivableBalanceHistorySummary,
} from './receivable-balance-history-query.port';

export interface GetReceivableBalanceHistorySummaryInput {
  filters: ReceivableBalanceHistoryFilterInput;
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
    };
    const dates = resolveDateFilters(input.filters);
    filters.from = dates.from;
    filters.to = dates.to;

    return this.historyQuery.summarize(organizationId, filters);
  }
}
