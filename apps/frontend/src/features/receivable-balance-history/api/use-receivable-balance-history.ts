import { useQuery } from '@tanstack/react-query';
import type {
  ReceivableBalanceHistoryFilters,
  ReceivableBalanceHistoryListQuery,
} from '../types';
import {
  fetchReceivableBalanceHistory,
  fetchReceivableBalanceHistorySummary,
} from './receivable-balance-history-api';

export function useReceivableBalanceHistory(
  query: ReceivableBalanceHistoryListQuery,
) {
  return useQuery({
    queryKey: [
      'receivable-balance-history',
      'list',
      query.page,
      query.limit,
      query.receivableId ?? '',
      query.from ?? '',
      query.to ?? '',
      query.status ?? 'ALL',
      query.changeSource ?? 'ALL',
    ],
    queryFn: () => fetchReceivableBalanceHistory(query),
  });
}

export function useReceivableBalanceHistorySummary(
  filters: ReceivableBalanceHistoryFilters,
) {
  return useQuery({
    queryKey: [
      'receivable-balance-history',
      'summary',
      filters.receivableId ?? '',
      filters.from ?? '',
      filters.to ?? '',
      filters.status ?? 'ALL',
      filters.changeSource ?? 'ALL',
    ],
    queryFn: () => fetchReceivableBalanceHistorySummary(filters),
  });
}
