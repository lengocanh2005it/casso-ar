import { Inject, Injectable } from '@nestjs/common';
import {
  AI_USAGE_LOG_REPOSITORY,
  type AIUsageDailyTrendPoint,
  type IAIUsageLogRepository,
} from '../../copilot/application/ai-usage-log-repository.port';

export interface GetAiUsageTrendInput {
  from: Date;
  to: Date;
}

@Injectable()
export class GetAiUsageTrendUseCase {
  constructor(
    @Inject(AI_USAGE_LOG_REPOSITORY)
    private readonly aiUsageRepo: IAIUsageLogRepository,
  ) {}

  async execute(
    input: GetAiUsageTrendInput,
  ): Promise<AIUsageDailyTrendPoint[]> {
    return this.aiUsageRepo.aggregateDailyTrend(input.from, input.to);
  }
}
