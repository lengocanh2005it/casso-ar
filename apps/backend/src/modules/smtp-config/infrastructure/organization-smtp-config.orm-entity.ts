import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  VersionColumn,
} from 'typeorm';
import { SmtpConfigStatus } from '../domain/organization-smtp-config';

@Entity({ name: 'organization_smtp_configs' })
@Unique(['organizationId'])
export class OrganizationSmtpConfigOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  organizationId: string;

  @Column({ type: 'varchar' })
  host: string;

  @Column('int')
  port: number;

  @Column({ type: 'varchar' })
  username: string;

  @Column({ type: 'varchar' })
  encryptedPassword: string;

  @Column({ type: 'varchar' })
  fromAddress: string;

  @Column({ type: 'enum', enum: SmtpConfigStatus })
  status: SmtpConfigStatus;

  @Column({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz' })
  updatedAt: Date;

  @VersionColumn()
  version: number;
}
