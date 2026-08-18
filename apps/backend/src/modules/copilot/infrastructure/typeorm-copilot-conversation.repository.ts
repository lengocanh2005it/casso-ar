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
  CopilotConversationSummary,
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
    title: row.title,
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
    title?: string,
    manager?: EntityManager,
  ): Promise<CopilotConversation> {
    const organizationId = this.tenantContext.getOrganizationId();
    const repo = manager
      ? manager.getRepository(CopilotConversationOrmEntity)
      : this.ormRepo;
    const select = {
      id: true,
      organizationId: true,
      userId: true,
      customerId: true,
      title: true,
      createdAt: true,
    } as const;
    const existing = await repo.findOne({
      select,
      where: { id: conversationId, organizationId, userId },
    });
    if (existing) return toConversation(existing);

    const ownedByAnotherUser = await repo.findOne({
      select,
      where: { id: conversationId, organizationId },
    });
    if (ownedByAnotherUser) return toConversation(ownedByAnotherUser);

    const row = await repo.save({
      id: conversationId,
      organizationId,
      userId,
      customerId: null,
      title: title ?? null,
      createdAt: new Date(),
    });
    return toConversation(row);
  }

  async findById(conversationId: string): Promise<CopilotConversation | null> {
    const organizationId = this.tenantContext.getOrganizationId();
    const row = await this.ormRepo.findOne({
      select: {
        id: true,
        organizationId: true,
        userId: true,
        customerId: true,
        title: true,
        createdAt: true,
      },
      where: { id: conversationId, organizationId },
    });
    return row ? toConversation(row) : null;
  }

  async listByUser(
    userId: string,
    page: number,
    limit: number,
  ): Promise<{ items: CopilotConversationSummary[]; total: number }> {
    const organizationId = this.tenantContext.getOrganizationId();
    const rows = await this.ormRepo
      .createQueryBuilder('conversation')
      .leftJoin(
        CopilotMessageOrmEntity,
        'message',
        'message.conversationId = conversation.id',
      )
      .select('conversation.id', 'id')
      .addSelect('conversation.title', 'title')
      .addSelect('conversation.createdAt', 'createdAt')
      .addSelect('MAX(message.createdAt)', 'lastMessageAt')
      .where('conversation.organizationId = :organizationId', {
        organizationId,
      })
      .andWhere('conversation.userId = :userId', { userId })
      .groupBy('conversation.id')
      .orderBy('"lastMessageAt"', 'DESC', 'NULLS LAST')
      .limit(limit)
      .offset((page - 1) * limit)
      .getRawMany<{
        id: string;
        title: string | null;
        createdAt: Date;
        lastMessageAt: Date | null;
      }>();

    const total = await this.ormRepo.count({
      where: { organizationId, userId },
    });

    return {
      items: rows.map((row) => ({
        id: row.id,
        title: row.title,
        createdAt: row.createdAt,
        lastMessageAt: row.lastMessageAt ?? row.createdAt,
      })),
      total,
    };
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
