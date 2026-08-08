import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { CasIdConnectionSessionStatus } from '../domain/cas-id-connection-session';

@Entity({ name: 'cas_id_connection_sessions' })
@Index(['organizationId'])
export class CasIdConnectionSessionOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  organizationId: string;

  @Column({ type: 'varchar' })
  initiatedByUserId: string;

  @Column({ type: 'uuid', nullable: true })
  bankConnectionId: string | null;

  @Column('text')
  grantToken: string;

  @Column('simple-array')
  scopes: string[];

  @Column({ type: 'varchar' })
  redirectUri: string;

  @Column({ type: 'varchar' })
  status: CasIdConnectionSessionStatus;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}
