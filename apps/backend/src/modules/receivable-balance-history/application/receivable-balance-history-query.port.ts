import type { ReceivableStatus } from '@casso-ledger/shared-types';
import type { BalanceHistoryActorType } from '../domain/balance-history-actor-type';
import type { BalanceHistoryChangeSource } from '../domain/balance-history-change-source';
import type { BalanceHistoryReasonCode } from '../domain/balance-history-reason-code';

export interface HistoricalOutstandingPoint {
  month: string; // YYYY-MM in Asia/Ho_Chi_Minh
  outstanding: number | null;
}

export interface ReceivableBalanceHistoryListFilters {
  receivableId?: string;
  from?: Date; // inclusive instant; null means unbounded
  to?: Date; // inclusive instant; null means unbounded
  status?: ReceivableStatus;
  changeSource?: BalanceHistoryChangeSource;
  actorType?: BalanceHistoryActorType;
}

export interface ReceivableBalanceHistoryListItem {
  id: string;
  sequence: number;
  receivableId: string;
  invoiceNumber: string | null;
  customerId: string;
  customerName: string | null;
  status: ReceivableStatus;
  remainingAmount: number;
  effectiveAt: Date;
  changeSource: BalanceHistoryChangeSource;
  reasonCode: BalanceHistoryReasonCode | null;
  actorType: BalanceHistoryActorType | null;
  actorDisplayName: string | null;
  transitionReferenceId: string | null;
  note: string | null;
}

export interface ReceivableBalanceHistoryListPage {
  items: ReceivableBalanceHistoryListItem[];
  total: number;
}

export interface ReceivableBalanceHistoryDailyPoint {
  date: string; // YYYY-MM-DD in Asia/Ho_Chi_Minh
  transitions: number;
}

export interface ReceivableBalanceHistorySourcePoint {
  changeSource: BalanceHistoryChangeSource;
  count: number;
}

export interface ReceivableBalanceHistorySummary {
  totalTransitions: number;
  affectedReceivables: number;
  latestRemainingAmount: number;
  dailySeries: ReceivableBalanceHistoryDailyPoint[];
  sourceDistribution: ReceivableBalanceHistorySourcePoint[];
}

export interface IReceivableBalanceHistoryQuery {
  findOutstandingByMonthEnds(
    organizationId: string,
    monthEnds: Date[],
  ): Promise<HistoricalOutstandingPoint[]>;

  list(
    organizationId: string,
    filters: ReceivableBalanceHistoryListFilters,
    page: number,
    limit: number,
  ): Promise<ReceivableBalanceHistoryListPage>;

  summarize(
    organizationId: string,
    filters: ReceivableBalanceHistoryListFilters,
  ): Promise<ReceivableBalanceHistorySummary>;
}

export const RECEIVABLE_BALANCE_HISTORY_QUERY = Symbol(
  'RECEIVABLE_BALANCE_HISTORY_QUERY',
);
