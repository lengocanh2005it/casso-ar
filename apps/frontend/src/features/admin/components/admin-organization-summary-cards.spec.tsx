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

    await screen.findByText('2');
    expect(screen.getByText('Tổng số tổ chức')).toBeInTheDocument();
    expect(screen.getByText('Tổ chức đang bị khóa')).toBeInTheDocument();
    expect(
      screen.getByText('Tổng số tổ chức').closest('[data-slot="card"]'),
    ).toHaveTextContent('2');
    expect(
      screen.getByText('Tổ chức đang bị khóa').closest('[data-slot="card"]'),
    ).toHaveTextContent('1');
  });

  it('lays the cards out as a four-up grid so the row fills the width', async () => {
    vi.mocked(adminApi.listOrganizations).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 100,
    });

    const { container } = renderCards();

    await screen.findByText('Tổng số tổ chức');

    // Two half-width cards left most of a 1440px screen empty; the main app
    // uses four columns for the same summary row.
    expect(
      container.querySelector('[data-testid="admin-summary-grid"]'),
    ).toHaveClass('sm:grid-cols-2', 'xl:grid-cols-4');
  });

  it('surfaces organizations awaiting review so the row carries its weight', async () => {
    vi.mocked(adminApi.listOrganizations).mockResolvedValue({
      items: [
        {
          id: 'org-1',
          name: 'Acme',
          status: 'PENDING_REVIEW',
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

    expect(await screen.findByText('Tổ chức chờ duyệt')).toBeInTheDocument();
    expect(await screen.findByText('Chờ phê duyệt')).toBeInTheDocument();
    // The pending count is its own figure, not a repeat of a neighbouring card.
    expect(
      screen.getByText('Tổ chức chờ duyệt').closest('[data-slot="card"]'),
    ).toHaveTextContent('1');
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
