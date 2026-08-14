import { Inject, Injectable } from '@nestjs/common';
import {
  AI_USAGE_LOG_REPOSITORY,
  type IAIUsageLogRepository,
} from '../../copilot/application/ai-usage-log-repository.port';
import {
  type IOrganizationRepository,
  ORGANIZATION_REPOSITORY,
} from '../../organizations/application/organization-repository.port';

export interface GetAiUsageAggregateInput {
  from: Date;
  to: Date;
}

export interface AiUsageAggregateItem {
  organizationId: string;
  organizationName: string;
  model: string;
  requestCount: number;
  totalTokens: number;
  errorCount: number;
}

@Injectable()
export class GetAiUsageAggregateUseCase {
  constructor(
    @Inject(AI_USAGE_LOG_REPOSITORY)
    private readonly aiUsageRepo: IAIUsageLogRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepo: IOrganizationRepository,
  ) {}

  async execute(
    input: GetAiUsageAggregateInput,
  ): Promise<AiUsageAggregateItem[]> {
    const rows = await this.aiUsageRepo.aggregateByOrgAndModel(
      input.from,
      input.to,
    );
    const organizations = await this.organizationRepo.findByIds([
      ...new Set(rows.map((row) => row.organizationId)),
    ]);

    return rows.map((row) => ({
      organizationId: row.organizationId,
      organizationName:
        organizations.get(row.organizationId)?.name ?? 'Unknown',
      model: row.model,
      requestCount: row.requestCount,
      totalTokens: row.totalTokens,
      errorCount: row.errorCount,
    }));
  }
}
