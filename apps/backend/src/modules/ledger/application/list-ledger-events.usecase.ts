import { Inject, Injectable } from '@nestjs/common';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import {
  type ILedgerEventQuery,
  LEDGER_EVENT_QUERY,
  type LedgerEventListFilters,
  type LedgerEventListPage,
} from './ledger-event-query.port';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export interface ListLedgerEventsInput {
  filters: LedgerEventListFilters;
  page?: number;
  limit?: number;
}

@Injectable()
export class ListLedgerEventsUseCase {
  constructor(
    @Inject(LEDGER_EVENT_QUERY)
    private readonly ledgerQuery: ILedgerEventQuery,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(input: ListLedgerEventsInput): Promise<LedgerEventListPage> {
    const organizationId = this.tenantContext.getOrganizationId();
    const page = Math.max(1, input.page ?? DEFAULT_PAGE);
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, input.limit ?? DEFAULT_LIMIT),
    );
    return this.ledgerQuery.list(organizationId, input.filters, page, limit);
  }
}
