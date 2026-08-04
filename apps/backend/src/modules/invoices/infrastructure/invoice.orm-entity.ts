import { Check, Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { type InvoiceSourceType, InvoiceStatus } from '../domain/invoice';

@Entity({ name: 'invoices' })
@Index(['organizationId'])
@Check(
  '"totalAmount" >= 0 AND "taxAmount" >= 0 AND "taxAmount" <= "totalAmount"',
)
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

  @Column({ type: 'varchar' })
  sourceType: InvoiceSourceType;

  @Column({ type: 'varchar', nullable: true })
  fileUrl: string | null;

  @Column({ type: 'enum', enum: InvoiceStatus })
  status: InvoiceStatus;

  @Column()
  createdAt: Date;
}
