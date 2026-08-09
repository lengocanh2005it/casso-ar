import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity({ name: 'copilot_drafts' })
@Index(['organizationId', 'receivableId'])
export class CopilotDraftOrmEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column()
  organizationId: string;

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
