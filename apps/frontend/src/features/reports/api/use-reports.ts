import { useQuery } from '@tanstack/react-query';
import type { TrendMonths } from '../types';
import {
  type CustomerAgingFilters,
  fetchAging,
  fetchCustomerAging,
  fetchDashboardSummary,
  fetchReportsTrend,
} from './reports-api';

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
