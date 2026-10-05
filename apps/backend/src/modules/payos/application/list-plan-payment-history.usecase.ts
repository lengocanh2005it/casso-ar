import { Inject, Injectable } from '@nestjs/common';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import {
  type IPlanPaymentHistoryRepository,
  PLAN_PAYMENT_HISTORY_REPOSITORY,
  type PlanPaymentHistoryPage,
} from './plan-payment-history-repository.port';

export interface ListPlanPaymentHistoryInput {
  page: number;
  limit: number;
}

export interface ListPlanPaymentHistoryOutput extends PlanPaymentHistoryPage {
  page: number;
  limit: number;
}

@Injectable()
export class ListPlanPaymentHistoryUseCase {
  constructor(
    @Inject(PLAN_PAYMENT_HISTORY_REPOSITORY)
    private readonly historyRepo: IPlanPaymentHistoryRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(
    input: ListPlanPaymentHistoryInput,
  ): Promise<ListPlanPaymentHistoryOutput> {
    const organizationId = this.tenantContext.getOrganizationId();
    const result = await this.historyRepo.findPage({
      organizationId,
      page: input.page,
      limit: input.limit,
    });
    return { ...result, page: input.page, limit: input.limit };
  }
}
