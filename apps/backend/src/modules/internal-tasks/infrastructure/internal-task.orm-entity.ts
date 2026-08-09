import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  VersionColumn,
} from 'typeorm';
import type {
  InternalTaskStatus,
  InternalTaskType,
} from '../domain/internal-task';

const INTERNAL_TASK_TYPES: InternalTaskType[] = ['ESCALATION', 'MANUAL'];
const INTERNAL_TASK_STATUSES: InternalTaskStatus[] = [
  'OPEN',
  'DONE',
  'DISMISSED',
];

@Entity({ name: 'internal_tasks' })
@Index(['organizationId', 'receivableId', 'status'])
@Index(
  'uq_internal_open_escalation_per_receivable',
  ['organizationId', 'receivableId'],
  {
    unique: true,
    where: '"taskType" = \'ESCALATION\' AND "status" = \'OPEN\'',
  },
)
export class InternalTaskOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  organizationId: string;

  @Column()
  receivableId: string;

  @Column()
  assignedToUserId: string;

  @Column({ type: 'varchar', nullable: true })
  createdByUserId: string | null;

  @Column({ type: 'enum', enum: INTERNAL_TASK_TYPES })
  taskType: InternalTaskType;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'date', nullable: true })
  dueDate: Date | null;

  @Column({ type: 'enum', enum: INTERNAL_TASK_STATUSES })
  status: InternalTaskStatus;

  @Column({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  resolvedAt: Date | null;

  @VersionColumn()
  version: number;
}
