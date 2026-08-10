export type AgingBucket =
  | 'NOT_DUE'
  | 'OVERDUE_1_7'
  | 'OVERDUE_8_30'
  | 'OVERDUE_31_60'
  | 'OVERDUE_60_PLUS';

export interface AgingReport {
  buckets: Array<{
    bucket: AgingBucket;
    count: number;
    totalRemaining: number;
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
