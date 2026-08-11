import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PlanLimitService } from '../../billing/application/plan-limit.service';

export interface CopilotUsage {
  turnsUsed: number;
  turnsLimit: number;
  periodStart: Date;
  periodEnd: Date;
}

@Injectable()
export class GetCopilotUsageUseCase {
  constructor(
    private readonly planLimitService: PlanLimitService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async execute(): Promise<CopilotUsage> {
    return this.dataSource.transaction((manager) =>
      this.planLimitService.getCopilotUsage(manager),
    );
  }
}
