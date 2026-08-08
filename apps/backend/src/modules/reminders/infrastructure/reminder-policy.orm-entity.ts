import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { CustomerGroup } from '../../customers/domain/customer-group';

@Entity({ name: 'reminder_policies' })
@Index(['organizationId', 'customerGroup'], { unique: true })
export class ReminderPolicyOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  organizationId: string;

  @Column({ type: 'enum', enum: CustomerGroup })
  customerGroup: CustomerGroup;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}
