import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { CustomerGroup } from '../domain/customer-group';

@Entity({ name: 'customers' })
@Index(['organizationId'])
export class CustomerOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  organizationId: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar' })
  taxCode: string;

  @Column({ type: 'varchar' })
  email: string;

  @Column({ type: 'varchar' })
  phone: string;

  @Column({ type: 'integer' })
  defaultPaymentTermDays: number;

  @Column('bigint')
  creditLimit: number;

  @Column({ type: 'integer' })
  priority: number;

  @Column({ type: 'enum', enum: CustomerGroup, default: CustomerGroup.REGULAR })
  customerGroup: CustomerGroup;

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}
