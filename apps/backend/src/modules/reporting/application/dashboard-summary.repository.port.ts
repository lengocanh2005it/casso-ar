export interface DashboardPeriod {
  from: Date;
  to: Date;
}

export interface OutstandingSummary {
  totalOutstanding: number;
  totalOverdue: number;
}

export interface ForecastSummary {
  forecast7d: number;
  forecast14d: number;
  forecast30d: number;
}

export interface TopOverdueCustomer {
  customerId: string;
  customerName: string;
  totalOverdue: number;
}

export interface AutoMatchStats {
  matchedCount: number;
  totalCount: number;
}

export interface ReminderEffectivenessStats {
  paidWithin7dCount: number;
  sentCount: number;
}

export interface DashboardSummary {
  totalOutstanding: number;
  totalOverdue: number;
  overdueRate: number;
  cashForecast: ForecastSummary;
  topOverdueCustomers: TopOverdueCustomer[];
  autoMatchRate: number | null;
  manualHandlingRate: number | null;
  reminderEffectiveness: number | null;
}

export const DASHBOARD_SUMMARY_REPOSITORY = Symbol(
  'DASHBOARD_SUMMARY_REPOSITORY',
);

export interface IDashboardSummaryRepository {
  getOutstandingSummary(organizationId: string): Promise<OutstandingSummary>;
  getForecast(organizationId: string): Promise<ForecastSummary>;
  getTopOverdueCustomers(
    organizationId: string,
    salesRepresentativeId?: string,
  ): Promise<TopOverdueCustomer[]>;
  getAutoMatchStats(
    organizationId: string,
    period: DashboardPeriod,
  ): Promise<AutoMatchStats>;
  getReminderEffectivenessStats(
    organizationId: string,
    period: DashboardPeriod,
  ): Promise<ReminderEffectivenessStats>;
}
