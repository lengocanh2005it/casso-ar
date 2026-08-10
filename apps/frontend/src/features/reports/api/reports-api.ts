import { apiRequest } from '@/lib/api-client';
import type { AgingReport, DashboardSummary } from '../types';

export function fetchAging(): Promise<AgingReport> {
  return apiRequest<AgingReport>({
    url: '/api/v1/reports/aging',
    method: 'GET',
  });
}

export function fetchDashboardSummary(): Promise<DashboardSummary> {
  return apiRequest<DashboardSummary>({
    url: '/api/v1/reports/dashboard-summary',
    method: 'GET',
  });
}
