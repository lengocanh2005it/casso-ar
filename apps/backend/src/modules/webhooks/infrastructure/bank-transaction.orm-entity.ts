import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  VersionColumn,
} from 'typeorm';
import type { BankTransactionStatus } from '../domain/bank-transaction';

@Entity({ name: 'bank_transactions' })
@Index(['organizationId', 'status'])
@Index(['organizationId', 'createdAt'])
export class BankTransactionOrmEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar' }) organizationId: string;
  @Column({ type: 'varchar' }) bankConnectionId: string;
  @Column({ type: 'varchar' }) webhookInboxId: string;
  @Column({ type: 'varchar', unique: true }) providerTransactionId: string;
  @Column('bigint') amount: number;
  @Column({ type: 'timestamp' }) transactionDateTime: Date;
  @Column({ type: 'varchar' }) counterpartyAccountNumber: string;
  @Column({ type: 'varchar' }) counterpartyName: string;
  @Column('text') transferContent: string;
  @Column({ type: 'varchar' }) status: BankTransactionStatus;
  @VersionColumn() version: number;
  @Column({ type: 'timestamptz' }) createdAt: Date;
}
