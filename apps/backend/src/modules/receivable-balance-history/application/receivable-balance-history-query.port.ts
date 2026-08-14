export interface HistoricalOutstandingPoint {
  month: string; // YYYY-MM in Asia/Ho_Chi_Minh
  outstanding: number | null;
}

export interface IReceivableBalanceHistoryQuery {
  findOutstandingByMonthEnds(
    organizationId: string,
    monthEnds: Date[],
  ): Promise<HistoricalOutstandingPoint[]>;
}

export const RECEIVABLE_BALANCE_HISTORY_QUERY = Symbol(
  'RECEIVABLE_BALANCE_HISTORY_QUERY',
);
