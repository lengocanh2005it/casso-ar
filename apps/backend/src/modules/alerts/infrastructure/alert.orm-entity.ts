import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { AlertType } from '../domain/alert';

// ponytail: no retention/cleanup job for this INSERT-heavy table yet — see
// issue #118 (no retention job for INSERT-only tables) for the follow-up.
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
