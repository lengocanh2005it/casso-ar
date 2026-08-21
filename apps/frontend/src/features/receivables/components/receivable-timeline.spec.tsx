import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReceivableTimeline } from './receivable-timeline';

const { fetchReceivableTimeline } = vi.hoisted(() => ({
  fetchReceivableTimeline: vi.fn(),
}));

vi.mock('../api/receivables-api', () => ({ fetchReceivableTimeline }));

function renderTimeline() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ReceivableTimeline receivableId="rec-1" />
    </QueryClientProvider>,
  );
}

describe('ReceivableTimeline', () => {
  it('shows the Vietnamese label for an activity type instead of its raw code', async () => {
    fetchReceivableTimeline.mockResolvedValue({
      items: [
        {
          id: 'act-1',
          receivableId: 'rec-1',
          customerId: 'cust-1',
          activityType: 'PAYMENT_RECEIVED',
          description: 'Nhận thanh toán 5.000.000 ₫',
          metadata: {},
          createdByUserId: null,
          createdAt: '2026-08-13T00:00:00Z',
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    });

    renderTimeline();

    await waitFor(() =>
      expect(screen.getByText('Nhận thanh toán')).toBeTruthy(),
    );
    expect(screen.queryByText('PAYMENT_RECEIVED')).toBeNull();
  });

  it('wraps a long unbroken activity description', async () => {
    const description = `transfer-${'z'.repeat(100)}`;
    fetchReceivableTimeline.mockResolvedValue({
      items: [
        {
          id: 'act-long',
          receivableId: 'rec-1',
          customerId: 'cust-1',
          activityType: 'PAYMENT_RECEIVED',
          description,
          metadata: {},
          createdByUserId: null,
          createdAt: '2026-08-13T00:00:00Z',
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    });

    renderTimeline();

    const activity = await screen.findByText(description);
    expect(activity).toHaveClass('break-words');
    expect(activity).toHaveTextContent(description);
  });
});
