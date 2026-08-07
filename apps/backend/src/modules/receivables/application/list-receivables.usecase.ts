import { Inject, Injectable } from '@nestjs/common';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { IDisputeRepository } from '../../disputes/application/dispute-repository.port';
import { Role } from '../../organizations/domain/membership';
import type { ReceivableListFilters } from '../application/receivable-repository.port';
import {
  type IReceivableRepository,
  RECEIVABLE_REPOSITORY,
} from '../application/receivable-repository.port';
import {
  type ReceivableSummaryResponseDto,
  toReceivableSummaryResponse,
} from '../presentation/dto/receivable-summary-response.dto';

@Injectable()
export class ListReceivablesUseCase {
  constructor(
    @Inject(RECEIVABLE_REPOSITORY)
    private readonly receivableRepo: IReceivableRepository,
    private readonly disputeRepo: IDisputeRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(input: {
    filters: ReceivableListFilters;
    page: number;
    limit: number;
  }): Promise<{
    items: ReceivableSummaryResponseDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    const orgId = this.tenantContext.getOrganizationId();
    const user = this.tenantContext.getCurrentUser();

    const filters = { ...input.filters };

    // SALES_REP role: auto-scope to own receivables
    if (user?.role === Role.SALES_REP) {
      filters.salesRepresentativeId = user.userId;
    }

    const [receivables, total] = await Promise.all([
      this.receivableRepo.findPage(orgId, filters, input.page, input.limit),
      this.receivableRepo.count(orgId, filters),
    ]);

    const now = new Date();
    const items = await Promise.all(
      receivables.map(async (r) => {
        const isOverdue =
          r.status !== 'PAID' && r.dueDate.getTime() < now.getTime();
        const openDispute = await this.disputeRepo.findOpenDispute(r.id);
        return toReceivableSummaryResponse(
          r,
          isOverdue,
          !!openDispute,
          openDispute?.id ?? null,
        );
      }),
    );

    return { items, total, page: input.page, limit: input.limit };
  }
}
