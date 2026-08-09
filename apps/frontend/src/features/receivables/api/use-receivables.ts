import { useQuery } from '@tanstack/react-query';
import type { ReceivableFilters } from './receivables-api';
import { fetchReceivables } from './receivables-api';

export function useReceivables(filters: ReceivableFilters, page = 1) {
  return useQuery({
    queryKey: ['receivables', filters, page],
    queryFn: () => fetchReceivables(filters, page),
  });
}
