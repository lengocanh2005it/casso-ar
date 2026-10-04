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

  it('shows total org count and locked count from the summary endpoint', async () => {
    vi.mocked(adminApi.getOrganizationSummary).mockResolvedValue({
      total: 2,
      statusCounts: {
        ACTIVE: 1,
        LOCKED: 1,
        PENDING_REVIEW: 0,
        REJECTED: 0,
      },
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
    vi.mocked(adminApi.getOrganizationSummary).mockResolvedValue({
      total: 0,
      statusCounts: {
        ACTIVE: 0,
        LOCKED: 0,
        PENDING_REVIEW: 0,
        REJECTED: 0,
      },
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
    vi.mocked(adminApi.getOrganizationSummary).mockResolvedValue({
      total: 2,
      statusCounts: {
        ACTIVE: 1,
        LOCKED: 0,
        PENDING_REVIEW: 1,
        REJECTED: 0,
      },
    });

    renderCards();

    expect(await screen.findByText('Tổ chức chờ duyệt')).toBeInTheDocument();
    expect(await screen.findByText('Chờ phê duyệt')).toBeInTheDocument();
    // The pending count is its own figure, not a repeat of a neighbouring card.
    expect(
      screen.getByText('Tổ chức chờ duyệt').closest('[data-slot="card"]'),
    ).toHaveTextContent('1');
  });

  it('reads whole-installation counts rather than counting a single page', async () => {
    vi.mocked(adminApi.getOrganizationSummary).mockResolvedValue({
      // The list endpoint caps at 100 rows. Filtering that page reported "2
      // active" for an installation that actually has 200.
      total: 250,
      statusCounts: {
        ACTIVE: 200,
        LOCKED: 30,
        PENDING_REVIEW: 15,
        REJECTED: 5,
      },
    });

    renderCards();

    await screen.findByText('Tổng số tổ chức');
    expect(
      screen.getByText('Tổ chức đang hoạt động').closest('[data-slot="card"]'),
    ).toHaveTextContent('200');
    expect(
      screen.getByText('Tổ chức đang bị khóa').closest('[data-slot="card"]'),
    ).toHaveTextContent('30');
    expect(
      screen.getByText('Tổ chức chờ duyệt').closest('[data-slot="card"]'),
    ).toHaveTextContent('15');
    expect(screen.getByText('250')).toBeInTheDocument();
  });

  it('announces a loading failure with a next step', async () => {
    vi.mocked(adminApi.getOrganizationSummary).mockRejectedValue(
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
