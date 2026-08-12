import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import type { WebhookInboxStatus } from '../../domain/webhook-inbox';

const WEBHOOK_INBOX_STATUSES = ['RECEIVED', 'PROCESSED', 'FAILED'] as const;

export class ListWebhookInboxQuery {
  @IsOptional()
  @IsIn(WEBHOOK_INBOX_STATUSES)
  status?: WebhookInboxStatus;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}
