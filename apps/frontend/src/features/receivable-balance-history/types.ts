import type { ReceivableStatus } from '@/features/receivables/types';

export type ReceivableBalanceHistoryActorType = 'USER' | 'SYSTEM' | 'WEBHOOK';

export type ReceivableBalanceHistoryChangeSource =
  | 'CREATE'
  | 'ALLOCATE'
  | 'UNDO'
  | 'CANCEL'
  | 'WRITE_OFF'
  | 'ROLLOUT_BASELINE';

export type ReceivableBalanceHistoryReasonCode =
  | 'RECEIVABLE_CREATED'
  | 'PAYMENT_ALLOCATED'
  | 'PAYMENT_ALLOCATION_UNDONE'
  | 'RECEIVABLE_CANCELLED'
  | 'RECEIVABLE_WRITTEN_OFF'
  | 'ROLLOUT_BASELINE';

export interface ReceivableBalanceHistoryListItem {
  id: string;
  sequence: number;
  receivableId: string;
  invoiceNumber: string | null;
  customerId: string;
  customerName: string | null;
  status: ReceivableStatus;
  remainingAmount: number;
  effectiveAt: string;
  changeSource: ReceivableBalanceHistoryChangeSource;
  reasonCode: ReceivableBalanceHistoryReasonCode | null;
  actorType: ReceivableBalanceHistoryActorType | null;
  actorUserId: string | null;
  actorDisplayName: string | null;
  transitionReferenceId: string | null;
  note: string | null;
}

export interface ReceivableBalanceHistoryPage {
  items: ReceivableBalanceHistoryListItem[];
  total: number;
  page: number;
  limit: number;
}

export interface ReceivableBalanceHistoryDailyPoint {
  date: string;
  transitions: number;
}

export interface ReceivableBalanceHistorySourcePoint {
  changeSource: ReceivableBalanceHistoryChangeSource;
  count: number;
}

export interface ReceivableBalanceHistorySummary {
  totalTransitions: number;
  affectedReceivables: number;
  latestRemainingAmount: number;
  dailySeries: ReceivableBalanceHistoryDailyPoint[];
  sourceDistribution: ReceivableBalanceHistorySourcePoint[];
}

export interface ReceivableBalanceHistoryFilters {
  receivableId?: string;
  from?: string;
  to?: string;
  status?: ReceivableStatus;
  changeSource?: ReceivableBalanceHistoryChangeSource;
}

export interface ReceivableBalanceHistoryListQuery
  extends ReceivableBalanceHistoryFilters {
  page: number;
  limit: number;
}
