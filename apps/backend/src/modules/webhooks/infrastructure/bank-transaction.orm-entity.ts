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
export class BankTransactionOrmEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() organizationId: string;
  @Column() bankConnectionId: string;
  @Column() webhookInboxId: string;
  @Column({ unique: true }) providerTransactionId: string;
  @Column('bigint') amount: number;
  @Column({ type: 'timestamp' }) transactionDateTime: Date;
  @Column() counterpartyAccountNumber: string;
  @Column() counterpartyName: string;
  @Column('text') transferContent: string;
  @Column({ type: 'varchar' }) status: BankTransactionStatus;
  @VersionColumn() version: number;
  @Column() createdAt: Date;
}
