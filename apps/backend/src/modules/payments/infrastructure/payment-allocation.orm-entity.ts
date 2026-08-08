import { Check, Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'payment_allocations' })
@Index(['organizationId'])
@Check('"allocatedAmount" > 0')
export class PaymentAllocationOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  organizationId: string;

  @Column({ type: 'varchar' })
  paymentId: string;

  @Column({ type: 'varchar' })
  receivableId: string;

  @Column('bigint')
  allocatedAmount: number;

  @Column({ type: 'timestamptz' })
  allocatedAt: Date;

  @Column({ type: 'varchar', nullable: true })
  allocatedByUserId: string | null;

  @Column({ type: 'timestamp', nullable: true })
  deletedAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  deletedByUserId: string | null;

  @Column({ type: 'varchar', nullable: true })
  undoReason: string | null;

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}
