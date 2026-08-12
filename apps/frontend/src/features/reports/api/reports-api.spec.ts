import { describe, expect, it, vi } from 'vitest';

const apiRequest = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

import { exportAgingReportCsv } from './reports-api';

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
