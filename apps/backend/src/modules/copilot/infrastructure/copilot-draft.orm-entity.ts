import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity({ name: 'copilot_drafts' })
@Index(['organizationId', 'receivableId'])
@Index(['organizationId', 'userId'])
export class CopilotDraftOrmEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column()
  organizationId: string;

  @Column({ type: 'varchar', nullable: true })
  userId: string | null;

  @Column()
  receivableId: string;

  @Column()
  recipientEmail: string;

  @Column()
  subject: string;

  @Column('text')
  bodyHtml: string;

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}
