import { apiRequest, apiRequestWithHeaders } from '@/lib/api-client';
import type {
  ReceivableBalanceHistoryFilters,
  ReceivableBalanceHistoryListQuery,
  ReceivableBalanceHistoryPage,
  ReceivableBalanceHistorySummary,
} from '../types';

export function fetchReceivableBalanceHistory(
  query: ReceivableBalanceHistoryListQuery,
): Promise<ReceivableBalanceHistoryPage> {
  return apiRequest<ReceivableBalanceHistoryPage>({
    url: '/api/v1/receivable-balance-history',
    method: 'GET',
    params: {
      page: query.page,
      limit: query.limit,
      ...(query.receivableId ? { receivableId: query.receivableId } : {}),
      ...(query.from ? { from: query.from } : {}),
      ...(query.to ? { to: query.to } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.changeSource ? { changeSource: query.changeSource } : {}),
      ...(query.actorType ? { actorType: query.actorType } : {}),
    },
  });
}

export function fetchReceivableBalanceHistorySummary(
  filters: ReceivableBalanceHistoryFilters,
): Promise<ReceivableBalanceHistorySummary> {
  return apiRequest<ReceivableBalanceHistorySummary>({
    url: '/api/v1/receivable-balance-history/summary',
    method: 'GET',
    params: {
      ...(filters.receivableId ? { receivableId: filters.receivableId } : {}),
      ...(filters.from ? { from: filters.from } : {}),
      ...(filters.to ? { to: filters.to } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.changeSource ? { changeSource: filters.changeSource } : {}),
      ...(filters.actorType ? { actorType: filters.actorType } : {}),
    },
  });
}

export async function exportReceivableBalanceHistoryCsv(
  filters: ReceivableBalanceHistoryFilters,
): Promise<{ csv: string; truncated: boolean }> {
  const { data, headers } = await apiRequestWithHeaders<string>({
    url: '/api/v1/receivable-balance-history/export',
    method: 'GET',
    responseType: 'text',
    params: {
      ...(filters.receivableId ? { receivableId: filters.receivableId } : {}),
      ...(filters.from ? { from: filters.from } : {}),
      ...(filters.to ? { to: filters.to } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.changeSource ? { changeSource: filters.changeSource } : {}),
      ...(filters.actorType ? { actorType: filters.actorType } : {}),
    },
  });
  return { csv: data, truncated: headers['x-export-truncated'] === 'true' };
}
