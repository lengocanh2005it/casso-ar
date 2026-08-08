import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { CustomerGroup } from '../../customers/domain/customer-group';

@Entity({ name: 'reminder_policies' })
@Index(['organizationId', 'customerGroup'], { unique: true })
export class ReminderPolicyOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  organizationId: string;

  @Column({ type: 'enum', enum: CustomerGroup })
  customerGroup: CustomerGroup;

  @Column({ default: true })
  isActive: boolean;

  @Column()
  createdAt: Date;
}
