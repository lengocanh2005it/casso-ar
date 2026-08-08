import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'reminder_rules' })
@Index(['reminderPolicyId', 'offsetDays'], { unique: true })
export class ReminderRuleOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  reminderPolicyId: string;

  @Column('integer')
  offsetDays: number;

  @Column({ type: 'varchar' })
  emailTemplateId: string;

  @Column('integer')
  minIntervalDays: number;

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}
