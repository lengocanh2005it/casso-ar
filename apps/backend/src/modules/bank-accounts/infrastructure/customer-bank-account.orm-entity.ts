import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'customer_bank_accounts' })
@Index(['organizationId', 'accountNumber'])
export class CustomerBankAccountOrmEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar' }) organizationId: string;
  @Column({ type: 'varchar' }) customerId: string;
  @Column({ type: 'varchar' }) accountNumber: string;
  @Column({ type: 'timestamptz' }) createdAt: Date;
}
