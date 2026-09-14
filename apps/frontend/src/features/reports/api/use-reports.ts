import { useQuery } from '@tanstack/react-query';
import { queryClient } from '@/lib/query-client';
import type { TrendMonths } from '../types';
import {
  type CustomerAgingFilters,
  fetchAging,
  fetchCustomerAging,
  fetchDashboardSummary,
  fetchReportsTrend,
} from './reports-api';

export const dashboardSummaryQueryKey = ['reports', 'dashboard'] as const;

export function useAgingReport() {
  return useQuery({
    queryKey: ['reports', 'aging'],
    queryFn: fetchAging,
  });
}

export function useCustomerAging(filters: CustomerAgingFilters) {
  return useQuery({
    queryKey: [
      'reports',
      'aging-customers',
      filters.page,
      filters.limit,
      filters.search ?? '',
      filters.bucket ?? 'ALL',
    ],
    queryFn: () => fetchCustomerAging(filters),
  });
}

export function useReportsTrend(months: TrendMonths) {
  return useQuery({
    queryKey: ['reports', 'trend', months],
    queryFn: () => fetchReportsTrend(months),
  });
}

export function useDashboardSummary() {
  return useQuery({
    queryKey: dashboardSummaryQueryKey,
    queryFn: fetchDashboardSummary,
  });
}

export function prefetchDashboardSummary() {
  return queryClient.prefetchQuery({
    queryKey: dashboardSummaryQueryKey,
    queryFn: fetchDashboardSummary,
  });
}
