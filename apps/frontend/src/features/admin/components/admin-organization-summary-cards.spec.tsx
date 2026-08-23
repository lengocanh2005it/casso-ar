import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as adminApi from '../api/admin-api';
import { AdminOrganizationSummaryCards } from './admin-organization-summary-cards';

vi.mock('../api/admin-api');

function renderCards() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AdminOrganizationSummaryCards />
    </QueryClientProvider>,
  );
}

describe('AdminOrganizationSummaryCards', () => {
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

    renderCards();

    expect(await screen.findByText('2')).toBeInTheDocument();
    expect(await screen.findByText('1')).toBeInTheDocument();
    expect(screen.getByText('Tổng số tổ chức')).toBeInTheDocument();
    expect(screen.getByText('Tổ chức đang bị khóa')).toBeInTheDocument();
  });

  it('announces a loading failure with a next step', async () => {
    vi.mocked(adminApi.listOrganizations).mockRejectedValue(
      new Error('network'),
    );

    renderCards();

    expect(await screen.findByRole('status')).toHaveAttribute(
      'aria-live',
      'polite',
    );
    expect(
      await screen.findByText(/không thể tải trạng thái tổ chức/i),
    ).toBeInTheDocument();
  });
});
