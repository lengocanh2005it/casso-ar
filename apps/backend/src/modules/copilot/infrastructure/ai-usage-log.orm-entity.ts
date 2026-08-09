import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'ai_usage_logs' })
@Index(['organizationId', 'createdAt'])
export class AIUsageLogOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  organizationId: string;

  @Column()
  conversationId: string;

  @Column()
  model: string;

  @Column()
  promptVersion: string;

  @Column({ type: 'int', nullable: true })
  inputTokens: number | null;

  @Column({ type: 'int', nullable: true })
  outputTokens: number | null;

  @Column({ type: 'int' })
  latencyMs: number;

  @Column({ type: 'int' })
  toolCallsCount: number;

  @Column({ type: 'boolean', default: false })
  isError: boolean;

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}
