import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type {
  CopilotMessageRecord,
  CopilotMessageRole,
} from '../application/conversation-repository.port';

@Entity({ name: 'copilot_messages' })
@Index(['conversationId', 'createdAt'])
@Index(['organizationId', 'role', 'createdAt'])
export class CopilotMessageOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  organizationId: string;

  @Column()
  conversationId: string;

  @Column({ type: 'varchar' })
  role: CopilotMessageRole;

  @Column('text')
  content: string;

  @Column({ type: 'jsonb', nullable: true })
  toolCalls: CopilotMessageRecord['toolCalls'];

  @Column({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'boolean', default: false })
  isPartial: boolean;
}
