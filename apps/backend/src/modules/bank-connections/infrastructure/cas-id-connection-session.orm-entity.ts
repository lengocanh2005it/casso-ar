import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  VersionColumn,
} from 'typeorm';
import type { CasIdConnectionSessionStatus } from '../domain/cas-id-connection-session';

@Entity({ name: 'cas_id_connection_sessions' })
@Index(['organizationId'])
export class CasIdConnectionSessionOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  organizationId: string;

  @Column()
  initiatedByUserId: string;

  @Column({ type: 'uuid', nullable: true })
  bankConnectionId: string | null;

  @Column('text')
  grantToken: string;

  @Column('simple-array')
  scopes: string[];

  @Column()
  redirectUri: string;

  @Column({ type: 'varchar' })
  status: CasIdConnectionSessionStatus;

  @Column()
  expiresAt: Date;

  @Column()
  createdAt: Date;

  @VersionColumn()
  version: number;
}
