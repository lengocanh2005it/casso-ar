export type AgingBucket =
  | 'NOT_DUE'
  | 'OVERDUE_1_7'
  | 'OVERDUE_8_30'
  | 'OVERDUE_31_60'
  | 'OVERDUE_60_PLUS';

export type TrendMonths = 3 | 6 | 12;

export interface AgingReport {
  buckets: Array<{
    bucket: AgingBucket;
    count: number;
    totalRemaining: number;
  }>;
}

export interface CustomerAgingPage {
  items: Array<{
    customerId: string;
    customerName: string;
    taxCode: string;
    buckets: Array<{ bucket: AgingBucket; totalRemaining: number }>;
    totalRemaining: number;
  }>;
  total: number;
  page: number;
  limit: number;
}

export interface ReportsTrend {
  months: TrendMonths;
  items: Array<{
    month: string;
    outstanding: number | null;
    collected: number;
  }>;
}

export interface DashboardSummary {
  totalOutstanding: number;
  totalOverdue: number;
  overdueRate: number;
  cashForecast: {
    forecast7d: number;
    forecast14d: number;
    forecast30d: number;
  };
  topOverdueCustomers: Array<{
    customerId: string;
    customerName: string;
    totalOverdue: number;
  }>;
  autoMatchRate: number | null;
  manualHandlingRate: number | null;
  reminderEffectiveness: number | null;
}
