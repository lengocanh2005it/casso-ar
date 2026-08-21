import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'email_template_attachments' })
@Index(['organizationId'])
@Index(['emailTemplateId'])
export class EmailTemplateAttachmentOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  organizationId: string;

  @Column({ type: 'varchar' })
  emailTemplateId: string;

  @Column({ type: 'varchar' })
  filename: string;

  @Column({ type: 'varchar' })
  storageKey: string;

  @Column({ type: 'varchar' })
  mimeType: string;

  @Column({ type: 'integer' })
  sizeBytes: number;

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}
