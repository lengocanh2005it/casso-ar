import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { Repository } from 'typeorm';
import { BaseRepository } from '../../../common/tenancy/base.repository';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type {
  CopilotConversation,
  CopilotMessageRecord,
  ICopilotConversationRepository,
} from '../application/conversation-repository.port';
import { CopilotConversationOrmEntity } from './copilot-conversation.orm-entity';
import { CopilotMessageOrmEntity } from './copilot-message.orm-entity';

function toConversation(
  row: CopilotConversationOrmEntity,
): CopilotConversation {
  return {
    id: row.id,
    organizationId: row.organizationId,
    userId: row.userId,
    customerId: row.customerId,
    createdAt: row.createdAt,
  };
}

function toMessage(row: CopilotMessageOrmEntity): CopilotMessageRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    conversationId: row.conversationId,
    role: row.role,
    content: row.content,
    toolCalls: row.toolCalls,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class TypeOrmCopilotConversationRepository
  extends BaseRepository<CopilotConversationOrmEntity>
  implements ICopilotConversationRepository
{
  constructor(
    @InjectRepository(CopilotConversationOrmEntity)
    repo: Repository<CopilotConversationOrmEntity>,
    @InjectRepository(CopilotMessageOrmEntity)
    private readonly messageRepo: Repository<CopilotMessageOrmEntity>,
    tenantContext: TenantContextService,
  ) {
    super(repo, tenantContext);
  }

  async findOrCreate(
    conversationId: string,
    userId: string,
  ): Promise<CopilotConversation> {
    const organizationId = this.tenantContext.getOrganizationId();
    const existing = await this.ormRepo.findOne({
      where: { id: conversationId, organizationId },
    });
    if (existing) return toConversation(existing);

    const row = await this.ormRepo.save({
      id: conversationId,
      organizationId,
      userId,
      customerId: null,
      createdAt: new Date(),
    });
    return toConversation(row);
  }

  async listMessages(conversationId: string): Promise<CopilotMessageRecord[]> {
    const organizationId = this.tenantContext.getOrganizationId();
    const rows = await this.messageRepo.find({
      select: {
        id: true,
        organizationId: true,
        conversationId: true,
        role: true,
        content: true,
        toolCalls: true,
        createdAt: true,
      },
      where: { conversationId, organizationId },
      order: { createdAt: 'ASC' },
    });
    return rows.map(toMessage);
  }

  async appendMessage(
    message: Omit<CopilotMessageRecord, 'id' | 'organizationId'>,
    manager?: EntityManager,
  ): Promise<CopilotMessageRecord> {
    const organizationId = this.tenantContext.getOrganizationId();
    const repo = manager
      ? manager.getRepository(CopilotMessageOrmEntity)
      : this.messageRepo;
    const row = await repo.save({ organizationId, ...message });
    return toMessage(row);
  }
}
