import { ReceivableStatus } from '@casso-ledger/shared-types';
import { Check, Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { BalanceHistoryChangeSource } from '../domain/balance-history-change-source';

@Entity({ name: 'receivable_balance_history' })
@Index(['organizationId', 'effectiveAt'])
@Index(['organizationId', 'receivableId', 'effectiveAt'])
@Check('"remainingAmount" >= 0')
export class ReceivableBalanceHistoryOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  organizationId: string;

  @Column({ type: 'varchar' })
  receivableId: string;

  @Column({ type: 'enum', enum: ReceivableStatus })
  status: ReceivableStatus;

  @Column('bigint')
  remainingAmount: number;

  @Column({ type: 'timestamptz' })
  effectiveAt: Date;

  @Column({ type: 'varchar' })
  changeSource: BalanceHistoryChangeSource;

  @Column({ type: 'varchar', nullable: true })
  changeReason: string | null;

  @Column({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'bigint', generated: 'increment' })
  sequence: number;
}
