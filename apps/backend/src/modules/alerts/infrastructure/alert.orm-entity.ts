import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { AlertType } from '../domain/alert';

// Retention: read alerts older than 90 days are pruned by
// RetentionSchedulerService (common/retention/) — see issue #118, ADR-0015.
@Entity({ name: 'alerts' })
@Index('IDX_alerts_organization_user_read', [
  'organizationId',
  'userId',
  'readAt',
])
@Index(
  'UQ_alerts_user_entity_unread',
  ['userId', 'entityType', 'entityId', 'type'],
  { unique: true, where: '"readAt" IS NULL' },
)
@Index('IDX_alerts_read_at', ['readAt'], { where: '"readAt" IS NOT NULL' })
export class AlertOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  organizationId: string;

  @Column({ type: 'varchar' })
  userId: string;

  @Column({ type: 'enum', enum: AlertType })
  type: AlertType;

  @Column({ type: 'varchar' })
  entityType: string;

  @Column({ type: 'varchar' })
  entityId: string;

  @Column({ type: 'timestamptz', nullable: true })
  readAt: Date | null;

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}
