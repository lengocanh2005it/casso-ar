import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  VersionColumn,
} from 'typeorm';
import type {
  AccountIdentity,
  BankConnectionStatus,
} from '../domain/bank-connection';

@Entity({ name: 'bank_connections' })
@Index(['organizationId'])
export class BankConnectionOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  organizationId: string;

  @Column({ type: 'uuid' })
  casIdConnectionSessionId: string;

  @Column('text')
  encryptedAccessToken: string;

  @Column({ type: 'jsonb' })
  accountIdentity: AccountIdentity;

  @Column({ type: 'varchar' })
  status: BankConnectionStatus;

  @Column('simple-array')
  scopes: string[];

  @Column({ type: 'timestamp', nullable: true })
  connectedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  lastSyncAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  revokedAt: Date | null;

  @Column()
  createdAt: Date;

  @VersionColumn()
  version: number;
}
