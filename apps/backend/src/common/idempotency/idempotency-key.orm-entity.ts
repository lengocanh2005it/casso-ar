import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'idempotency_keys' })
@Index(['organizationId', 'endpoint', 'key'], { unique: true })
export class IdempotencyKeyOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  organizationId: string;

  @Column()
  endpoint: string;

  @Column()
  key: string;

  @Column()
  requestHash: string;

  @Column({ type: 'varchar' })
  status: 'PENDING' | 'COMPLETED';

  @Column({ type: 'jsonb', nullable: true })
  response: unknown;

  @Column()
  createdAt: Date;
}
