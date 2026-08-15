import type { ReceivableStatus } from '@casso-ledger/shared-types';
import type { BalanceHistoryActorType } from './balance-history-actor-type';
import type { BalanceHistoryChangeSource } from './balance-history-change-source';
import type { BalanceHistoryReasonCode } from './balance-history-reason-code';

export interface ReceivableBalanceHistoryEntry {
  id: string;
  organizationId: string;
  receivableId: string;
  status: ReceivableStatus;
  remainingAmount: number;
  effectiveAt: Date;
  changeSource: BalanceHistoryChangeSource;
  reasonCode: BalanceHistoryReasonCode | null;
  actorType: BalanceHistoryActorType | null;
  actorUserId: string | null;
  note: string | null;
  transitionReferenceId: string | null;
  createdAt: Date;
}
