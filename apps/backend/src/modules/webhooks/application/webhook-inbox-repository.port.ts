import type { EntityManager } from 'typeorm';
import type { WebhookInbox, WebhookInboxStatus } from '../domain/webhook-inbox';

export class DuplicateWebhookError extends Error {
  constructor(providerTransactionId: string) {
    super(`Webhook ${providerTransactionId} already received`);
  }
}

export interface WebhookInboxPageQuery {
  organizationId: string;
  status?: WebhookInboxStatus;
  providerTransactionId?: string;
  page: number;
  limit: number;
}

export interface IWebhookInboxRepository {
  insert(inbox: WebhookInbox, manager?: EntityManager): Promise<void>;
  save(inbox: WebhookInbox, manager?: EntityManager): Promise<void>;
  /**
   * Atomically marks the inbox FAILED (retryCount + 1) unless it is already
   * PROCESSED, which is terminal. Returns false when nothing was changed.
   */
  recordFailure(
    id: string,
    organizationId: string,
    errorMessage: string,
    manager?: EntityManager,
  ): Promise<boolean>;
  findById(id: string, organizationId: string): Promise<WebhookInbox | null>;
  findPage(
    query: WebhookInboxPageQuery,
  ): Promise<{ items: WebhookInbox[]; total: number }>;
  deleteOlderThan(cutoff: Date): Promise<number>;
}

export const WEBHOOK_INBOX_REPOSITORY = Symbol('WEBHOOK_INBOX_REPOSITORY');
