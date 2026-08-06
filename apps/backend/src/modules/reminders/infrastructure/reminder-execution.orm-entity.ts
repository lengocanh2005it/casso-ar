import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  VersionColumn,
} from 'typeorm';
import {
  ReminderExecutionStatus,
  ReminderSkipReason,
} from '../domain/reminder-execution';

@Entity('reminder_executions')
@Index(['organizationId', 'receivableId'])
export class ReminderExecutionOrmEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column('uuid')
  organizationId: string;

  @Column('uuid')
  receivableId: string;

  @Column('uuid', { nullable: true })
  reminderRuleId: string | null;

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

  @VersionColumn()
  version: number;
}
