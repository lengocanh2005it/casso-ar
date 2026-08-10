import { useQuery } from '@tanstack/react-query';
import { fetchAging, fetchDashboardSummary } from './reports-api';

export function useAgingReport() {
  return useQuery({
    queryKey: ['reports', 'aging'],
    queryFn: fetchAging,
  });
}

export function useDashboardSummary() {
  return useQuery({
    queryKey: ['reports', 'dashboard'],
    queryFn: fetchDashboardSummary,
  });
}
