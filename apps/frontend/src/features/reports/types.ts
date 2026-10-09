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
    totalRemaining: string;
  }>;
}

export interface CustomerAgingPage {
  items: Array<{
    customerId: string;
    customerName: string;
    taxCode: string;
    buckets: Array<{ bucket: AgingBucket; totalRemaining: string }>;
    totalRemaining: string;
  }>;
  total: number;
  page: number;
  limit: number;
}

export interface ReportsTrend {
  months: TrendMonths;
  items: Array<{
    month: string;
    outstanding: string | null;
    collected: string;
  }>;
}

export interface DashboardSummary {
  totalOutstanding: string;
  totalOverdue: string;
  overdueRate: number;
  cashForecast: {
    forecast7d: string;
    forecast14d: string;
    forecast30d: string;
  };
  topOverdueCustomers: Array<{
    customerId: string;
    customerName: string;
    totalOverdue: string;
  }>;
  autoMatchRate: number | null;
  manualHandlingRate: number | null;
  reminderEffectiveness: number | null;
}
