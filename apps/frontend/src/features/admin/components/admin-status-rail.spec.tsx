import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as adminApi from '../api/admin-api';
import { AdminStatusRail } from './admin-status-rail';

vi.mock('../api/admin-api');

function renderRail() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AdminStatusRail />
    </QueryClientProvider>,
  );
}

describe('AdminStatusRail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows total org count and locked count from listOrganizations', async () => {
    vi.mocked(adminApi.listOrganizations).mockResolvedValue({
      items: [
        {
          id: 'org-1',
          name: 'Acme',
          status: 'LOCKED',
          createdAt: '2026-08-01T00:00:00.000Z',
        },
        {
          id: 'org-2',
          name: 'Beta',
          status: 'ACTIVE',
          createdAt: '2026-08-01T00:00:00.000Z',
        },
      ],
      total: 2,
      page: 1,
      limit: 100,
    });

    renderRail();

    expect(await screen.findByText('2')).toBeInTheDocument();
    expect(await screen.findByText('1')).toBeInTheDocument();
  });

  it('announces a loading failure with a next step', async () => {
    vi.mocked(adminApi.listOrganizations).mockRejectedValue(
      new Error('network'),
    );

    renderRail();

    expect(await screen.findByRole('status')).toHaveAttribute(
      'aria-live',
      'polite',
    );
    expect(
      await screen.findByText(/không thể tải trạng thái tổ chức/i),
    ).toBeInTheDocument();
  });
});
