import { Check, Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'payments' })
@Index(['organizationId'])
@Check('"allocatedAmount" >= 0 AND "allocatedAmount" <= "totalAmount"')
export class PaymentOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  organizationId: string;

  @Column({ type: 'varchar', nullable: true })
  customerId: string | null;

  @Column({ type: 'varchar', nullable: true })
  bankTransactionId: string | null;

  @Column('bigint')
  totalAmount: number;

  @Column('bigint', { default: 0 })
  allocatedAmount: number;

  @Column()
  payerName: string;

  @Column()
  receivedAt: Date;

  @Column()
  createdAt: Date;
}
