import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'customer_bank_accounts' })
@Index(['organizationId', 'accountNumber'])
export class CustomerBankAccountOrmEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() organizationId: string;
  @Column() customerId: string;
  @Column() accountNumber: string;
  @Column() createdAt: Date;
}
