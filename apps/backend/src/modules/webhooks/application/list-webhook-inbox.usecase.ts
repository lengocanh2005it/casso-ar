import { Inject, Injectable } from '@nestjs/common';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { WebhookInboxStatus } from '../domain/webhook-inbox';
import { WebhookInbox } from '../domain/webhook-inbox';
import {
  type IWebhookInboxRepository,
  WEBHOOK_INBOX_REPOSITORY,
} from './webhook-inbox-repository.port';

export interface ListWebhookInboxInput {
  page: number;
  limit: number;
  status?: WebhookInboxStatus;
}

@Injectable()
export class ListWebhookInboxUseCase {
  constructor(
    @Inject(WEBHOOK_INBOX_REPOSITORY)
    private readonly repo: IWebhookInboxRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(
    input: ListWebhookInboxInput,
  ): Promise<{ items: WebhookInbox[]; total: number }> {
    return this.repo.findPage({
      organizationId: this.tenantContext.getOrganizationId(),
      page: input.page,
      limit: input.limit,
      ...(input.status ? { status: input.status } : {}),
    });
  }
}
