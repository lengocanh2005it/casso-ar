import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'customer_bank_accounts' })
@Index(['organizationId', 'accountNumber', 'isActive'])
@Index(
  'UQ_customer_bank_accounts_org_account_customer',
  ['organizationId', 'accountNumber', 'customerId'],
  { unique: true, where: '"isActive"' },
)
export class CustomerBankAccountOrmEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar' }) organizationId: string;
  @Column({ type: 'varchar' }) customerId: string;
  @Column({ type: 'varchar' }) accountNumber: string;
  @Column({ type: 'boolean', default: true }) isActive: boolean;
  @Column({ type: 'varchar', nullable: true })
  confirmedByUserId?: string | null;
  @Column({ type: 'timestamptz', nullable: true })
  confirmedAt?: Date | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}
