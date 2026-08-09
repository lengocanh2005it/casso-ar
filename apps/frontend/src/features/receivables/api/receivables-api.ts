import { apiRequest } from '@/lib/api-client';
import type { Receivable, ReceivableStatus } from '../types';

export interface ReceivablePage {
  items: Receivable[];
  total: number;
  page: number;
  limit: number;
}

export interface ReceivableFilters {
  status?: ReceivableStatus;
  salesRepresentativeId?: string;
}

export function fetchReceivables(
  filters: ReceivableFilters,
  page: number,
): Promise<ReceivablePage> {
  return apiRequest<ReceivablePage>({
    url: '/api/v1/receivables',
    method: 'GET',
    params: { ...filters, page, limit: 20 },
  });
}
