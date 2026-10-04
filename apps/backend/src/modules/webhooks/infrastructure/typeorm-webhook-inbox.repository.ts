import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, FindOptionsWhere, Repository } from 'typeorm';
import { LessThan } from 'typeorm';
import { deleteOlderThan } from '../../../common/database/delete-older-than';
import { isUniqueViolation } from '../../../common/database/unique-violation';
import type {
  IWebhookInboxRepository,
  WebhookInboxPageQuery,
} from '../application/webhook-inbox-repository.port';
import { DuplicateWebhookError } from '../application/webhook-inbox-repository.port';
import { WebhookInbox } from '../domain/webhook-inbox';
import { WebhookInboxOrmEntity } from './webhook-inbox.orm-entity';

function toOrm(inbox: WebhookInbox): WebhookInboxOrmEntity {
  return Object.assign(new WebhookInboxOrmEntity(), inbox);
}

const WEBHOOK_INBOX_SELECT = {
  id: true,
  organizationId: true,
  bankConnectionId: true,
  providerTransactionId: true,
  rawPayload: true,
  receivedAt: true,
  status: true,
  processedAt: true,
  errorMessage: true,
  retryCount: true,
} as const;

@Injectable()
export class TypeOrmWebhookInboxRepository implements IWebhookInboxRepository {
  constructor(
    @InjectRepository(WebhookInboxOrmEntity)
    private readonly repo: Repository<WebhookInboxOrmEntity>,
  ) {}

  async insert(inbox: WebhookInbox, manager?: EntityManager): Promise<void> {
    try {
      await (manager?.getRepository(WebhookInboxOrmEntity) ?? this.repo).save(
        toOrm(inbox),
      );
    } catch (error) {
      if (isUniqueViolation(error))
        throw new DuplicateWebhookError(inbox.providerTransactionId);
      throw error;
    }
  }

  async save(inbox: WebhookInbox, manager?: EntityManager): Promise<void> {
    await (manager?.getRepository(WebhookInboxOrmEntity) ?? this.repo).save(
      toOrm(inbox),
    );
  }

  async recordFailure(
    id: string,
    organizationId: string,
    errorMessage: string,
    manager?: EntityManager,
  ): Promise<boolean> {
    const result = await (
      manager?.getRepository(WebhookInboxOrmEntity) ?? this.repo
    )
      .createQueryBuilder()
      .update()
      .set({
        status: 'FAILED',
        errorMessage: errorMessage.slice(0, 500),
        retryCount: () => '"retryCount" + 1',
      })
      .where(
        '"id" = :id AND "organizationId" = :organizationId AND "status" <> :processed',
        { id, organizationId, processed: 'PROCESSED' },
      )
      .execute();
    return (result.affected ?? 0) > 0;
  }

  async findById(
    id: string,
    organizationId: string,
  ): Promise<WebhookInbox | null> {
    const row = await this.repo.findOne({ where: { id, organizationId } });
    return row ? new WebhookInbox(row) : null;
  }

  async findByProviderTransactionId(
    providerTransactionId: string,
    organizationId: string,
  ): Promise<WebhookInbox | null> {
    const row = await this.repo.findOne({
      where: { providerTransactionId, organizationId },
    });
    return row ? new WebhookInbox(row) : null;
  }

  async findStaleReceived(
    cutoff: Date,
    limit: number,
  ): Promise<WebhookInbox[]> {
    const rows = await this.repo.find({
      select: WEBHOOK_INBOX_SELECT,
      where: { status: 'RECEIVED', receivedAt: LessThan(cutoff) },
      order: { receivedAt: 'ASC' },
      take: limit,
    });
    return rows.map((row) => new WebhookInbox(row));
  }

  async findPage(
    query: WebhookInboxPageQuery,
  ): Promise<{ items: WebhookInbox[]; total: number }> {
    const where: FindOptionsWhere<WebhookInboxOrmEntity> = {
      organizationId: query.organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.providerTransactionId
        ? { providerTransactionId: query.providerTransactionId }
        : {}),
    };
    const [rows, total] = await this.repo.findAndCount({
      select: WEBHOOK_INBOX_SELECT,
      where,
      order: { receivedAt: 'DESC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return { items: rows.map((row) => new WebhookInbox(row)), total };
  }

  async deleteOlderThan(cutoff: Date): Promise<number> {
    return deleteOlderThan(this.repo, 'receivedAt', cutoff);
  }
}
