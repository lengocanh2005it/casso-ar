import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type {
  CopilotPendingActionStatus,
  SendReminderEmailPayload,
} from '../application/pending-action-repository.port';

@Entity({ name: 'copilot_pending_actions' })
@Index(['organizationId', 'status', 'createdAt'])
export class CopilotPendingActionOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  organizationId: string;

  @Column()
  conversationId: string;

  @Column({ type: 'varchar' })
  actionType: 'SEND_REMINDER_EMAIL';

  @Column({ type: 'jsonb' })
  payload: SendReminderEmailPayload;

  @Column({ type: 'varchar' })
  status: CopilotPendingActionStatus;

  @Column({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @Column({ nullable: true })
  resolvedByUserId: string | null;
}
