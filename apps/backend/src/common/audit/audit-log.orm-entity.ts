import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { AuditActionType, AuditEntityType } from './audit.enums';

@Entity({ name: 'audit_logs' })
@Index(['organizationId', 'createdAt'])
@Index('IDX_audit_logs_created_at', ['createdAt'])
export class AuditLogOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  organizationId: string;

  @Column({ type: 'varchar' })
  userId: string;

  @Column({ type: 'varchar' })
  actionType: AuditActionType;

  @Column({ type: 'varchar' })
  entityType: AuditEntityType;

  @Column({ type: 'varchar' })
  entityId: string;

  @Column({ type: 'jsonb', nullable: true })
  beforeState: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  afterState: Record<string, unknown> | null;

  @Column({ type: 'varchar', nullable: true })
  ipAddress: string | null;

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}
