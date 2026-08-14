import { Check, Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'payments' })
@Index(['organizationId'])
@Index('IDX_payments_organization_received_at', [
  'organizationId',
  'receivedAt',
])
@Check('"allocatedAmount" >= 0 AND "allocatedAmount" <= "totalAmount"')
export class PaymentOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  organizationId: string;

  @Column({ type: 'varchar', nullable: true })
  customerId: string | null;

  @Column({ type: 'varchar', nullable: true })
  bankTransactionId: string | null;

  @Column('bigint')
  totalAmount: number;

  @Column('bigint', { default: 0 })
  allocatedAmount: number;

  @Column({ type: 'varchar' })
  payerName: string;

  @Column({ type: 'timestamptz' })
  receivedAt: Date;

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}
