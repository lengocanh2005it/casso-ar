import { useQuery } from '@tanstack/react-query';
import type { AuditLogListQuery } from '../types';
import { fetchAuditLogs } from './audit-logs-api';

export function useAuditLogs(query: AuditLogListQuery) {
  const { page, limit, ...filters } = query;
  return useQuery({
    queryKey: ['audit-logs', filters, page, limit],
    queryFn: () => fetchAuditLogs(filters, page, limit),
  });
}
