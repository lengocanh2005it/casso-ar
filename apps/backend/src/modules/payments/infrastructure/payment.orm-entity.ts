import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'payments' })
export class PaymentOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  organizationId: string;

  @Column({ nullable: true })
  customerId: string | null;

  @Column({ nullable: true })
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
