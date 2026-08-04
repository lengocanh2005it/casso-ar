import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'payment_allocations' })
export class PaymentAllocationOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  organizationId: string;

  @Column()
  paymentId: string;

  @Column()
  receivableId: string;

  @Column('bigint')
  allocatedAmount: number;

  @Column()
  allocatedAt: Date;

  @Column({ type: 'varchar', nullable: true })
  allocatedByUserId: string | null;

  @Column({ type: 'timestamp', nullable: true })
  deletedAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  deletedByUserId: string | null;

  @Column({ type: 'varchar', nullable: true })
  undoReason: string | null;

  @Column()
  createdAt: Date;
}
