import { ReceivableStatus } from '@casso-ledger/shared-types';
import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  VersionColumn,
} from 'typeorm';

@Entity({ name: 'receivables' })
@Index(['organizationId', 'status', 'dueDate'])
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

  @Column()
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  closedAt: Date | null;

  @VersionColumn()
  version: number;
}
