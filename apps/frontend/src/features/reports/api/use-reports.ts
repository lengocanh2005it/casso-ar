import { useQuery } from '@tanstack/react-query';
import {
  fetchAging,
  fetchCustomerAging,
  fetchDashboardSummary,
  fetchReportsTrend,
  type CustomerAgingFilters,
} from './reports-api';
import type { TrendMonths } from '../types';

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
    queryKey: ['reports', 'dashboard'],
    queryFn: fetchDashboardSummary,
  });
}
