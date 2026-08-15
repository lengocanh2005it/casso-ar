import { describe, expect, it, vi } from 'vitest';
import type { ReceivableStatus } from '@/features/receivables/types';

const apiRequest = vi.fn();
const apiRequestWithHeaders = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  apiRequestWithHeaders: (...args: unknown[]) => apiRequestWithHeaders(...args),
}));

import {
  exportReceivableBalanceHistoryCsv,
  fetchReceivableBalanceHistory,
  fetchReceivableBalanceHistorySummary,
} from './receivable-balance-history-api';

describe('fetchReceivableBalanceHistory', () => {
  it('fetches the paginated list with all filters serialized', async () => {
    apiRequest.mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 2,
      limit: 20,
    });

    await fetchReceivableBalanceHistory({
      page: 2,
      limit: 20,
      receivableId: 'rec-1',
      from: '2026-08-01',
      to: '2026-08-31',
      status: 'PAID' as ReceivableStatus,
      changeSource: 'ALLOCATE',
      actorType: 'WEBHOOK',
    });

    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/v1/receivable-balance-history',
        method: 'GET',
        params: {
          page: 2,
          limit: 20,
          receivableId: 'rec-1',
          from: '2026-08-01',
          to: '2026-08-31',
          status: 'PAID',
          changeSource: 'ALLOCATE',
          actorType: 'WEBHOOK',
        },
      }),
    );
  });

  it('omits empty filters from the query string', async () => {
    apiRequest.mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
    });

    await fetchReceivableBalanceHistory({ page: 1, limit: 20 });

    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { page: 1, limit: 20 },
      }),
    );
  });
});

describe('fetchReceivableBalanceHistorySummary', () => {
  it('fetches the summary with the filter window', async () => {
    apiRequest.mockResolvedValueOnce({
      totalTransitions: 4,
      affectedReceivables: 1,
      latestRemainingAmount: 30_000_000,
      dailySeries: [],
      sourceDistribution: [],
    });

    await fetchReceivableBalanceHistorySummary({
      from: '2026-08-01',
      to: '2026-08-31',
    });

    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/v1/receivable-balance-history/summary',
        method: 'GET',
        params: { from: '2026-08-01', to: '2026-08-31' },
      }),
    );
  });
});

describe('exportReceivableBalanceHistoryCsv', () => {
  it('fetches the CSV and surfaces the truncation header', async () => {
    apiRequestWithHeaders.mockResolvedValueOnce({
      data: 'Thời điểm,Mã hóa đơn\r\n2026-08-01,INV-001',
      headers: { 'x-export-truncated': 'true' },
    });

    await expect(
      exportReceivableBalanceHistoryCsv({ changeSource: 'UNDO' }),
    ).resolves.toEqual({
      csv: 'Thời điểm,Mã hóa đơn\r\n2026-08-01,INV-001',
      truncated: true,
    });
    expect(apiRequestWithHeaders).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/v1/receivable-balance-history/export',
        method: 'GET',
        responseType: 'text',
        params: { changeSource: 'UNDO' },
      }),
    );
  });

  it('reports no truncation when the header is absent', async () => {
    apiRequestWithHeaders.mockResolvedValueOnce({
      data: 'a\r\n1',
      headers: {},
    });

    await expect(exportReceivableBalanceHistoryCsv({})).resolves.toEqual({
      csv: 'a\r\n1',
      truncated: false,
    });
  });
});
