import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'email_templates' })
export class EmailTemplateOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  organizationId: string;

  @Column()
  name: string;

  @Column()
  subject: string;

  @Column('text')
  bodyHtml: string;

  @Column({ type: 'varchar', nullable: true })
  reminderStage: string | null;

  @Column({ default: false })
  isDefault: boolean;

  @Column()
  createdAt: Date;

  @Column()
  updatedAt: Date;
}
