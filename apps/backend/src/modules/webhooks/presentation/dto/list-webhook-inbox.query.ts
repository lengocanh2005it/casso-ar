import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../../common/dto/pagination.dto';
import {
  WEBHOOK_INBOX_STATUSES,
  type WebhookInboxStatus,
} from '../../domain/webhook-inbox';

export class ListWebhookInboxQuery extends PaginationDto {
  @IsOptional()
  @IsIn(WEBHOOK_INBOX_STATUSES)
  status?: WebhookInboxStatus;

  @IsOptional()
  @IsString()
  providerTransactionId?: string;
}
