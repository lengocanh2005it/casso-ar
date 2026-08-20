import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { BankConnectionStatus } from '../domain/bank-connection';

@Entity({ name: 'bank_connections' })
@Index(['organizationId'])
export class BankConnectionOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  organizationId: string;

  @Column({ unique: true })
  accountNumber: string;

  @Column()
  bankName: string;

  @Column('text')
  encryptedSecureToken: string;

  @Column('text')
  encryptedCassoApiKey: string;

  @Column({ type: 'varchar' })
  status: BankConnectionStatus;

  @Column({ type: 'timestamp', nullable: true })
  connectedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  lastSyncAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  revokedAt: Date | null;

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}
