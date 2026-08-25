import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CustomerTimeline } from './customer-timeline';

describe('CustomerTimeline', () => {
  it('shows the Vietnamese label for an activity type instead of its raw description', () => {
    render(
      <CustomerTimeline
        items={[
          {
            id: 'act-1',
            receivableId: 'rec-1',
            activityType: 'PAYMENT_RECEIVED',
            description: 'Received payment of 30.000.000 VND for receivable',
            metadata: null,
            createdByUserId: null,
            createdAt: '2026-08-17T00:00:00Z',
          },
        ]}
      />,
    );

    expect(screen.getByText('Nhận thanh toán')).toBeTruthy();
    expect(
      screen.queryByText('Received payment of 30.000.000 VND for receivable'),
    ).toBeNull();
  });

  it('uses two compact columns when there are several activities', () => {
    render(
      <CustomerTimeline
        items={[
          {
            id: 'act-1',
            receivableId: 'rec-1',
            activityType: 'PAYMENT_RECEIVED',
            description: '',
            metadata: null,
            createdByUserId: null,
            createdAt: '2026-08-17T00:00:00Z',
          },
          {
            id: 'act-2',
            receivableId: 'rec-2',
            activityType: 'RECEIVABLE_CLOSED',
            description: '',
            metadata: null,
            createdByUserId: null,
            createdAt: '2026-08-16T00:00:00Z',
          },
        ]}
      />,
    );

    expect(screen.getByText('Nhận thanh toán').closest('ul')).toHaveClass(
      'grid',
      'sm:grid-cols-2',
    );
  });

  it('exposes the full activity label via title when the compact layout truncates it', () => {
    render(
      <CustomerTimeline
        items={[
          {
            id: 'act-1',
            receivableId: 'rec-1',
            activityType: 'PAYMENT_RECEIVED',
            description: '',
            metadata: null,
            createdByUserId: null,
            createdAt: '2026-08-17T00:00:00Z',
          },
        ]}
      />,
    );

    expect(screen.getByText('Nhận thanh toán')).toHaveAttribute(
      'title',
      'Nhận thanh toán',
    );
  });
});
