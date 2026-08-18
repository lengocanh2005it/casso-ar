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
});
