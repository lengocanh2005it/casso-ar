export type TrendMonths = 3 | 6 | 12;

export interface ReportingMonth {
  key: string; // YYYY-MM in Asia/Ho_Chi_Minh
  start: Date;
  end: Date;
  endExclusive: Date;
  isCurrent: boolean;
}

export interface CollectedPoint {
  month: string;
  collected: string;
}

export interface ReportsTrendPoint {
  month: string;
  outstanding: string | null;
  collected: string;
}

export const TREND_REPORT_REPOSITORY = Symbol('TREND_REPORT_REPOSITORY');

export interface ITrendReportRepository {
  findCollectedByMonths(
    organizationId: string,
    months: ReportingMonth[],
  ): Promise<CollectedPoint[]>;
}
