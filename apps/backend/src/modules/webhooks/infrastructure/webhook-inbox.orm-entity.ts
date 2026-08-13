import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { WebhookInboxStatus } from '../domain/webhook-inbox';

@Entity({ name: 'webhook_inbox' })
@Index(['organizationId', 'providerTransactionId'], { unique: true })
@Index('IDX_webhook_inbox_received_at', ['receivedAt'])
export class WebhookInboxOrmEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar' }) organizationId: string;
  @Column({ type: 'varchar' }) bankConnectionId: string;
  @Column({ type: 'varchar' }) providerTransactionId: string;
  @Column({ type: 'jsonb' }) rawPayload: Record<string, unknown>;
  @Column({ type: 'timestamp' }) receivedAt: Date;
  @Column({ type: 'varchar' }) status: WebhookInboxStatus;
  @Column({ type: 'timestamp', nullable: true }) processedAt: Date | null;
  @Column({ type: 'varchar', nullable: true }) errorMessage: string | null;
  @Column({ type: 'integer', default: 0 }) retryCount: number;
}
