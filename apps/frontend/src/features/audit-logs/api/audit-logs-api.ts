import { apiRequest } from '@/lib/api-client';
import type { AuditLogFilters, AuditLogPage } from '../types';

export function fetchAuditLogs(
  filters: AuditLogFilters,
  page: number,
  limit: number,
): Promise<AuditLogPage> {
  return apiRequest<AuditLogPage>({
    url: '/api/v1/audit-logs',
    method: 'GET',
    params: { page, limit, ...filters },
  });
}
