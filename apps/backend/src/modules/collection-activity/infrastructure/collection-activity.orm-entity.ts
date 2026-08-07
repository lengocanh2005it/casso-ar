import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { CollectionActivityType } from '../domain/collection-activity';

@Entity({ name: 'collection_activities' })
@Index(['receivableId', 'createdAt'])
@Index(['customerId', 'createdAt'])
export class CollectionActivityOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  organizationId: string;

  @Column()
  receivableId: string;

  @Column()
  customerId: string;

  @Column({ type: 'enum', enum: CollectionActivityType })
  activityType: CollectionActivityType;

  @Column()
  description: string;

  @Column('jsonb', { default: {} })
  metadata: Record<string, unknown>;

  @Column({ nullable: true })
  createdByUserId: string | null;

  @Column()
  createdAt: Date;
}
