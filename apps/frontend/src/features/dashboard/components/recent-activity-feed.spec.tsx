import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RecentActivityFeed } from './recent-activity-feed';

describe('RecentActivityFeed', () => {
  it('shows an empty state when there is no activity', () => {
    render(<RecentActivityFeed items={[]} />);
    expect(screen.getByText('Chưa có hoạt động.')).toBeTruthy();
  });

  it('renders each activity with its type, description, and date', () => {
    render(
      <RecentActivityFeed
        items={[
          {
            id: 'act-1',
            receivableId: 'rec-1',
            customerId: 'cust-1',
            activityType: 'PAYMENT_RECEIVED',
            description: 'Nhận thanh toán 5.000.000 ₫',
            createdAt: '2026-08-13T00:00:00Z',
          },
        ]}
      />,
    );
    expect(screen.getByText('Nhận thanh toán')).toBeTruthy();
    expect(screen.getByText('Nhận thanh toán 5.000.000 ₫')).toBeTruthy();
  });

  it('renders the date as machine-readable time with a breakable description', () => {
    render(
      <RecentActivityFeed
        items={[
          {
            id: 'act-1',
            receivableId: 'rec-1',
            customerId: 'cust-1',
            activityType: 'PAYMENT_RECEIVED',
            description: 'mô tả rất dài',
            createdAt: '2026-08-13T00:00:00Z',
          },
        ]}
      />,
    );
    expect(screen.getByRole('time')).toHaveAttribute(
      'dateTime',
      '2026-08-13T00:00:00Z',
    );
    expect(screen.getByText('mô tả rất dài')).toHaveClass('break-words');
  });
});
