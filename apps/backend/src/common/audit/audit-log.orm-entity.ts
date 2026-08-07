import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'audit_logs' })
@Index(['organizationId', 'createdAt'])
export class AuditLogOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  organizationId: string;

  @Column()
  userId: string;

  @Column()
  actionType: string;

  @Column()
  entityType: string;

  @Column()
  entityId: string;

  @Column({ type: 'jsonb', nullable: true })
  beforeState: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  afterState: Record<string, unknown> | null;

  @Column({ nullable: true })
  ipAddress: string | null;

  @Column()
  createdAt: Date;
}
