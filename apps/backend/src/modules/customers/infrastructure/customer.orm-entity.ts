import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { CustomerGroup } from '../domain/customer-group';

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

  @Column({ type: 'enum', enum: CustomerGroup, default: CustomerGroup.REGULAR })
  customerGroup: CustomerGroup;

  @Column()
  createdAt: Date;
}
