import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import { isUniqueViolation } from '../../../common/database/unique-violation';
import type { IWebhookInboxRepository } from '../application/webhook-inbox-repository.port';
import { DuplicateWebhookError } from '../application/webhook-inbox-repository.port';
import { WebhookInbox } from '../domain/webhook-inbox';
import { WebhookInboxOrmEntity } from './webhook-inbox.orm-entity';

function toOrm(inbox: WebhookInbox): WebhookInboxOrmEntity {
  return Object.assign(new WebhookInboxOrmEntity(), inbox);
}

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

  async findById(
    id: string,
    organizationId: string,
  ): Promise<WebhookInbox | null> {
    const row = await this.repo.findOne({ where: { id, organizationId } });
    return row ? new WebhookInbox(row) : null;
  }
}
