import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { deleteOlderThan } from '../../../common/database/delete-older-than';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type {
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
}
