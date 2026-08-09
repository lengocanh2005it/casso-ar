import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity({ name: 'copilot_conversations' })
@Index(['organizationId', 'userId'])
export class CopilotConversationOrmEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column()
  organizationId: string;

  @Column()
  userId: string;

  @Column({ nullable: true })
  customerId: string | null;

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}
