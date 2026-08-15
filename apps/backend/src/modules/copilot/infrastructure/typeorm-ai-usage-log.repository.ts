import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { deleteOlderThan } from '../../../common/database/delete-older-than';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type {
  AIUsageByOrgAndModel,
  AIUsageDailyTrendPoint,
  AIUsageLogEntry,
  IAIUsageLogRepository,
} from '../application/ai-usage-log-repository.port';
import { AIUsageLogOrmEntity } from './ai-usage-log.orm-entity';

@Injectable()
export class TypeOrmAIUsageLogRepository implements IAIUsageLogRepository {
  constructor(
    @InjectRepository(AIUsageLogOrmEntity)
    private readonly ormRepo: Repository<AIUsageLogOrmEntity>,
    private readonly tenantContext: TenantContextService,
  ) {}

  async log(entry: AIUsageLogEntry): Promise<void> {
    await this.ormRepo.save({
      id: randomUUID(),
      organizationId: this.tenantContext.getOrganizationId(),
      conversationId: entry.conversationId,
      model: entry.model,
      promptVersion: entry.promptVersion,
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
      latencyMs: entry.latencyMs,
      toolCallsCount: entry.toolCallsCount,
      isError: entry.isError,
      createdAt: new Date(),
    });
  }

  async deleteOlderThan(cutoff: Date): Promise<number> {
    return deleteOlderThan(this.ormRepo, 'createdAt', cutoff);
  }

  async aggregateByOrgAndModel(
    from: Date,
    to: Date,
  ): Promise<AIUsageByOrgAndModel[]> {
    const rows = await this.ormRepo
      .createQueryBuilder('log')
      .select('log.organizationId', 'organizationId')
      .addSelect('log.model', 'model')
      .addSelect('COUNT(*)', 'requestCount')
      .addSelect(
        'COALESCE(SUM(log.inputTokens), 0) + COALESCE(SUM(log.outputTokens), 0)',
        'totalTokens',
      )
      .addSelect('SUM(CASE WHEN log.isError THEN 1 ELSE 0 END)', 'errorCount')
      .where('log.createdAt BETWEEN :from AND :to', { from, to })
      .groupBy('log.organizationId')
      .addGroupBy('log.model')
      .getRawMany<{
        organizationId: string;
        model: string;
        requestCount: string;
        totalTokens: string;
        errorCount: string;
      }>();

    return rows.map((row) => ({
      organizationId: row.organizationId,
      model: row.model,
      requestCount: Number(row.requestCount),
      totalTokens: Number(row.totalTokens),
      errorCount: Number(row.errorCount),
    }));
  }

  async aggregateDailyTrend(
    from: Date,
    to: Date,
  ): Promise<AIUsageDailyTrendPoint[]> {
    const rows = await this.ormRepo
      .createQueryBuilder('log')
      .select("TO_CHAR(log.createdAt, 'YYYY-MM-DD')", 'date')
      .addSelect('COUNT(*)', 'requestCount')
      .addSelect(
        'COALESCE(SUM(log.inputTokens), 0) + COALESCE(SUM(log.outputTokens), 0)',
        'totalTokens',
      )
      .where('log.createdAt BETWEEN :from AND :to', { from, to })
      .groupBy("TO_CHAR(log.createdAt, 'YYYY-MM-DD')")
      .orderBy("TO_CHAR(log.createdAt, 'YYYY-MM-DD')", 'ASC')
      .getRawMany<{
        date: string;
        requestCount: string;
        totalTokens: string;
      }>();

    return rows.map((row) => ({
      date: row.date,
      requestCount: Number(row.requestCount),
      totalTokens: Number(row.totalTokens),
    }));
  }
}
