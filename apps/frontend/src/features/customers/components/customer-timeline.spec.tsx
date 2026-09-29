import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { CustomerTimeline } from './customer-timeline';

describe('CustomerTimeline', () => {
  it('shows the Vietnamese label for an activity type instead of its raw description', () => {
    render(
      <MemoryRouter>
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
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('Nhận thanh toán')).toBeTruthy();
    expect(
      screen.queryByText('Received payment of 30.000.000 VND for receivable'),
    ).toBeNull();
  });

  it('lists one activity per row with its full label, time and receivable link', () => {
    render(
      <MemoryRouter>
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
        />
      </MemoryRouter>,
    );

    // The old two-column chip grid truncated labels to "Nhận thanh t…".
    const label = screen.getByRole('link', { name: 'Nhận thanh toán' });
    expect(label).toHaveAttribute('href', '/receivables/rec-1');
    expect(label).not.toHaveClass('truncate');
    expect(label.closest('ul')).not.toHaveClass('sm:grid-cols-2');
    expect(label.closest('li')?.querySelector('time')).toHaveAttribute(
      'dateTime',
      '2026-08-17T00:00:00Z',
    );
  });
});
