import { apiRequest } from '@/lib/api-client';
import type {
  AgingBucket,
  AgingReport,
  CustomerAgingPage,
  DashboardSummary,
  ReportsTrend,
  TrendMonths,
} from '../types';

export interface CustomerAgingFilters {
  page: number;
  limit: number;
  search?: string;
  bucket?: AgingBucket;
}

export function fetchAging(): Promise<AgingReport> {
  return apiRequest<AgingReport>({
    url: '/api/v1/reports/aging',
    method: 'GET',
  });
}

export function fetchCustomerAging(
  filters: CustomerAgingFilters,
): Promise<CustomerAgingPage> {
  return apiRequest<CustomerAgingPage>({
    url: '/api/v1/reports/aging/customers',
    method: 'GET',
    params: {
      page: filters.page,
      limit: filters.limit,
      ...(filters.search ? { search: filters.search } : {}),
      ...(filters.bucket ? { bucket: filters.bucket } : {}),
    },
  });
}

export function fetchReportsTrend(months: TrendMonths): Promise<ReportsTrend> {
  return apiRequest<ReportsTrend>({
    url: '/api/v1/reports/trend',
    method: 'GET',
    params: { months },
  });
}

export function fetchDashboardSummary(): Promise<DashboardSummary> {
  return apiRequest<DashboardSummary>({
    url: '/api/v1/reports/dashboard-summary',
    method: 'GET',
  });
}

export function exportAgingReportCsv(): Promise<string> {
  return apiRequest<string>({
    url: '/api/v1/reports/aging/export',
    method: 'GET',
    responseType: 'text',
  });
}
