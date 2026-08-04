import {
  type InvoiceSourceType,
  InvoiceStatus,
} from '@casso-ledger/shared-types';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'invoices' })
export class InvoiceOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  organizationId: string;

  @Column()
  customerId: string;

  @Column()
  invoiceNumber: string;

  @Column()
  issueDate: Date;

  @Column('bigint')
  totalAmount: number;

  @Column('bigint')
  taxAmount: number;

  @Column()
  sourceType: InvoiceSourceType;

  @Column({ nullable: true })
  fileUrl: string | null;

  @Column({ type: 'enum', enum: InvoiceStatus })
  status: InvoiceStatus;

  @Column()
  createdAt: Date;
}
