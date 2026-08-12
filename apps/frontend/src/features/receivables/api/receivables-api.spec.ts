import { ReceivableStatus } from '@casso-ledger/shared-types';
import { describe, expect, it, vi } from 'vitest';

const apiRequestWithHeaders = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiRequest: vi.fn(),
  apiRequestWithHeaders: (...args: unknown[]) => apiRequestWithHeaders(...args),
  postWithIdempotency: vi.fn(),
}));

import { exportReceivablesCsv } from './receivables-api';

describe('exportReceivablesCsv', () => {
  it('returns the CSV text and truncated flag from the export header', async () => {
    apiRequestWithHeaders.mockResolvedValueOnce({
      data: 'a,b\n1,2',
      headers: { 'x-export-truncated': 'true' },
    });

    const result = await exportReceivablesCsv({
      status: ReceivableStatus.OPEN,
    });

    expect(apiRequestWithHeaders).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/v1/receivables/export',
        method: 'GET',
        params: { status: 'OPEN' },
        responseType: 'text',
      }),
    );
    expect(result).toEqual({ csv: 'a,b\n1,2', truncated: true });
  });

  it('reports truncated: false when the header is absent', async () => {
    apiRequestWithHeaders.mockResolvedValueOnce({
      data: 'a,b\n1,2',
      headers: {},
    });

    const result = await exportReceivablesCsv({});

    expect(result.truncated).toBe(false);
  });
});
