import { Inject, Injectable } from '@nestjs/common';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { resolveDateFilters } from './receivable-balance-history-date-filters';
import {
  type IReceivableBalanceHistoryQuery,
  RECEIVABLE_BALANCE_HISTORY_QUERY,
  type ReceivableBalanceHistoryFilterInput,
  type ReceivableBalanceHistoryListFilters,
  type ReceivableBalanceHistoryListPage,
} from './receivable-balance-history-query.port';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export interface ListReceivableBalanceHistoryInput {
  filters: ReceivableBalanceHistoryFilterInput;
  page?: number;
  limit?: number;
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
    const dates = resolveDateFilters(input.filters);
    const filters: ReceivableBalanceHistoryListFilters = {
      receivableId: input.filters.receivableId,
      from: dates.from,
      to: dates.to,
      status: input.filters.status,
      changeSource: input.filters.changeSource,
    };
    const page = Math.max(1, input.page ?? DEFAULT_PAGE);
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, input.limit ?? DEFAULT_LIMIT),
    );

    return this.historyQuery.list(organizationId, filters, page, limit);
  }
}
