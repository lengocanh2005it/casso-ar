import { describe, expect, it, vi } from 'vitest';

const apiRequest = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

import {
  exportAgingReportCsv,
  fetchCustomerAging,
  fetchReportsTrend,
} from './reports-api';

describe('exportAgingReportCsv', () => {
  it('fetches the aging report CSV as plain text', async () => {
    apiRequest.mockResolvedValueOnce('bucket,count\nNOT_DUE,3');

    await expect(exportAgingReportCsv()).resolves.toBe(
      'bucket,count\nNOT_DUE,3',
    );
    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/v1/reports/aging/export',
        method: 'GET',
        responseType: 'text',
      }),
    );
  });
});

describe('fetchCustomerAging', () => {
  it('fetches customer aging with page, limit, search, and bucket parameters', async () => {
    apiRequest.mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 2,
      limit: 20,
    });

    await fetchCustomerAging({
      page: 2,
      limit: 20,
      search: 'ACME',
      bucket: 'OVERDUE_60_PLUS',
    });

    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/v1/reports/aging/customers',
        method: 'GET',
        params: {
          page: 2,
          limit: 20,
          search: 'ACME',
          bucket: 'OVERDUE_60_PLUS',
        },
      }),
    );
  });

  it('omits empty search and bucket parameters', async () => {
    apiRequest.mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
    });

    await fetchCustomerAging({ page: 1, limit: 20 });

    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/v1/reports/aging/customers',
        params: { page: 1, limit: 20 },
      }),
    );
  });
});

describe('fetchReportsTrend', () => {
  it('fetches trend with the selected month preset', async () => {
    apiRequest.mockResolvedValueOnce({
      months: 6,
      items: [
        { month: '2026-03', outstanding: null, collected: '0' },
        { month: '2026-04', outstanding: '5000', collected: '1000' },
      ],
    });

    await expect(fetchReportsTrend(6)).resolves.toMatchObject({ months: 6 });
    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/v1/reports/trend',
        method: 'GET',
        params: { months: 6 },
      }),
    );
  });
});
