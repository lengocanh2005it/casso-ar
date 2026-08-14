import type { ReceivableStatus } from '@casso-ledger/shared-types';
import type { BalanceHistoryChangeSource } from './balance-history-change-source';

export interface ReceivableBalanceHistoryEntry {
  id: string;
  organizationId: string;
  receivableId: string;
  status: ReceivableStatus;
  remainingAmount: number;
  effectiveAt: Date;
  changeSource: BalanceHistoryChangeSource;
  changeReason: string | null;
  createdAt: Date;
}
