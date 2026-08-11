import { ReceivableStatus } from '@casso-ledger/shared-types';
import {
  Check,
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  VersionColumn,
} from 'typeorm';

@Entity({ name: 'receivables' })
@Index(['organizationId', 'status', 'dueDate'])
@Index(['organizationId', 'customerId', 'status'])
@Index(['organizationId', 'salesRepresentativeId'])
@Index('IDX_receivables_organization_created_at', [
  'organizationId',
  'createdAt',
])
@Check('"paidAmount" >= 0 AND "paidAmount" <= "originalAmount"')
export class ReceivableOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  organizationId: string;

  @Column()
  customerId: string;

  @Column({ type: 'varchar', nullable: true })
  invoiceId: string | null;

  @Column('bigint')
  originalAmount: number;

  @Column('bigint', { default: 0 })
  paidAmount: number;

  @Column()
  dueDate: Date;

  @Column({ type: 'enum', enum: ReceivableStatus })
  status: ReceivableStatus;

  @Column({ type: 'varchar', nullable: true })
  salesRepresentativeId: string | null;

  @Column({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  closedAt: Date | null;

  @VersionColumn()
  version: number;
}
