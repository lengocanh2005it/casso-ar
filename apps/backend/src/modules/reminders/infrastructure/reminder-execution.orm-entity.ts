import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';
import {
  ReminderExecutionStatus,
  ReminderSkipReason,
} from '../domain/reminder-execution';

@Entity('reminder_executions')
@Index(['organizationId', 'receivableId'])
@Index(['receivableId', 'reminderRuleId', 'executionDate'], { unique: true })
@Index(['organizationId', 'status', 'sentAt'])
@Index('IDX_reminder_executions_created_at', ['createdAt'])
@Index(
  'IDX_reminder_executions_pending_recovery',
  ['organizationId', 'createdAt'],
  {
    where: `"status" = 'PENDING' AND "reminderRuleId" IS NOT NULL`,
  },
)
export class ReminderExecutionOrmEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column('uuid')
  organizationId: string;

  @Column('uuid')
  receivableId: string;

  @Column('uuid', { nullable: true })
  reminderRuleId: string | null;

  @Column('integer', { nullable: true })
  minIntervalDays: number | null;

  @Column({ type: 'date' })
  executionDate: Date;

  @Column({ type: 'timestamptz', nullable: true })
  sentAt: Date | null;

  @Column({ type: 'enum', enum: ReminderExecutionStatus })
  status: ReminderExecutionStatus;

  @Column({ type: 'enum', enum: ReminderSkipReason, nullable: true })
  skipReason: ReminderSkipReason | null;

  @Column({ type: 'varchar', nullable: true })
  providerMessageId: string | null;

  @Column({ type: 'varchar', nullable: true })
  failureReason: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
