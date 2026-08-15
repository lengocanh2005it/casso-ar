import { ReceivableStatus } from '@casso-ledger/shared-types';
import { Check, Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { BalanceHistoryActorType } from '../domain/balance-history-actor-type';
import type { BalanceHistoryChangeSource } from '../domain/balance-history-change-source';
import type { BalanceHistoryReasonCode } from '../domain/balance-history-reason-code';

@Entity({ name: 'receivable_balance_history' })
@Index(['organizationId', 'effectiveAt'])
@Index(['organizationId', 'receivableId', 'effectiveAt'])
@Index(
  'UQ_receivable_balance_history_rollout_baseline',
  ['organizationId', 'receivableId'],
  { unique: true, where: `"changeSource" = 'ROLLOUT_BASELINE'` },
)
@Check('"remainingAmount" >= 0')
@Check(`"actorType" IS NULL OR "actorType" IN ('USER', 'SYSTEM', 'WEBHOOK')`)
@Check(
  `("actorType" IS NULL AND "actorUserId" IS NULL)
   OR ("actorType" = 'USER' AND "actorUserId" IS NOT NULL)
   OR ("actorType" IN ('SYSTEM', 'WEBHOOK') AND "actorUserId" IS NULL)`,
)
export class ReceivableBalanceHistoryOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  organizationId: string;

  @Column({ type: 'uuid' })
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

  @Column({ type: 'varchar', nullable: true })
  actorType: BalanceHistoryActorType | null;

  @Column({ type: 'uuid', nullable: true })
  actorUserId: string | null;

  @Column({ type: 'varchar', nullable: true })
  reasonCode: BalanceHistoryReasonCode | null;

  @Column({ type: 'varchar', nullable: true })
  note: string | null;

  @Column({ type: 'uuid', nullable: true })
  transitionReferenceId: string | null;

  @Column({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'bigint', generated: 'increment' })
  sequence: number;
}
