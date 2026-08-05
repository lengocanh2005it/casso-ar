import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { ConnectionAuditEventType } from '../domain/connection-audit-event';

@Entity({ name: 'connection_audit_events' })
@Index(['bankConnectionId'])
export class ConnectionAuditEventOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  bankConnectionId: string;

  @Column({ type: 'varchar' })
  eventType: ConnectionAuditEventType;

  @Column({ type: 'jsonb' })
  metadata: Record<string, unknown>;

  @Column()
  createdAt: Date;
}
