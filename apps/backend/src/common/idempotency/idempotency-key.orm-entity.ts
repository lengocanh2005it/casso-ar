import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'idempotency_keys' })
@Index(['organizationId', 'endpoint', 'key'], { unique: true })
@Index('IDX_idempotency_keys_created_at', ['createdAt'])
@Index('IDX_idempotency_keys_pending_created_at', ['status', 'createdAt'], {
  where: `"status" = 'PENDING'`,
})
export class IdempotencyKeyOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  organizationId: string;

  @Column({ type: 'varchar' })
  endpoint: string;

  @Column({ type: 'varchar' })
  key: string;

  @Column({ type: 'varchar' })
  requestHash: string;

  @Column({ type: 'varchar' })
  status: 'PENDING' | 'COMPLETED';

  @Column({ type: 'jsonb', nullable: true })
  response: unknown;

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}
