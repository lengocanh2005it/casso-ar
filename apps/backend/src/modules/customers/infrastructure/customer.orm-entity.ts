import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'customers' })
@Index(['organizationId'])
export class CustomerOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  organizationId: string;

  @Column()
  name: string;

  @Column()
  taxCode: string;

  @Column()
  email: string;

  @Column()
  phone: string;

  @Column()
  defaultPaymentTermDays: number;

  @Column('bigint')
  creditLimit: number;

  @Column()
  priority: number;

  @Column()
  createdAt: Date;
}
