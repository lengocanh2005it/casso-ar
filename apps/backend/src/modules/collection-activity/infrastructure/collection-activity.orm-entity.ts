import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { CollectionActivityType } from '../common/collection-activity-types';

@Entity({ name: 'collection_activities' })
@Index(['receivableId', 'createdAt'])
@Index(['customerId', 'createdAt'])
@Index('IDX_collection_activities_created_at', ['createdAt'])
export class CollectionActivityOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  organizationId: string;

  @Column({ type: 'varchar' })
  receivableId: string;

  @Column({ type: 'varchar' })
  customerId: string;

  @Column({ type: 'enum', enum: CollectionActivityType })
  activityType: CollectionActivityType;

  @Column({ type: 'varchar' })
  description: string;

  @Column('jsonb', { default: {} })
  metadata: Record<string, unknown>;

  @Column({ type: 'varchar', nullable: true })
  createdByUserId: string | null;

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}
