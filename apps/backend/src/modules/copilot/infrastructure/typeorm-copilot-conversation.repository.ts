import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { Repository } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
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
      select: {
        id: true,
        organizationId: true,
        userId: true,
        customerId: true,
        createdAt: true,
      },
      where: { id: conversationId, organizationId, userId },
    });
    if (existing) return toConversation(existing);

    const ownedByAnotherUser = await this.ormRepo.findOne({
      select: {
        id: true,
        organizationId: true,
        userId: true,
        customerId: true,
        createdAt: true,
      },
      where: { id: conversationId, organizationId },
    });
    if (ownedByAnotherUser) return toConversation(ownedByAnotherUser);

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
    const userId = this.tenantContext.getCurrentUser()?.userId;
    if (!userId) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Yêu cầu đăng nhập.');
    }
    const conversation = await this.ormRepo.findOne({
      select: { id: true },
      where: { id: conversationId, organizationId, userId },
    });
    if (!conversation) return [];

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
      order: { createdAt: 'DESC' },
      take: 20,
    });
    return rows.reverse().map(toMessage);
  }

  async appendMessage(
    message: Omit<CopilotMessageRecord, 'id' | 'organizationId'>,
    manager?: EntityManager,
  ): Promise<CopilotMessageRecord> {
    const organizationId = this.tenantContext.getOrganizationId();
    const userId = this.tenantContext.getCurrentUser()?.userId;
    if (!userId) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Yêu cầu đăng nhập.');
    }
    const conversationRepo = manager
      ? manager.getRepository(CopilotConversationOrmEntity)
      : this.ormRepo;
    const conversation = await conversationRepo.findOne({
      select: { id: true },
      where: { id: message.conversationId, organizationId, userId },
    });
    if (!conversation) {
      throw new AppError(
        ErrorCode.FORBIDDEN,
        'Bạn không có quyền truy cập cuộc hội thoại này.',
      );
    }
    const repo = manager
      ? manager.getRepository(CopilotMessageOrmEntity)
      : this.messageRepo;
    const row = await repo.save({ organizationId, ...message });
    return toMessage(row);
  }
}
