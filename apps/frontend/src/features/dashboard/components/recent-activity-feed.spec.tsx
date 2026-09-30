import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { RecentActivityFeed } from './recent-activity-feed';

describe('RecentActivityFeed', () => {
  it('shows an empty state when there is no activity', () => {
    render(
      <MemoryRouter>
        <RecentActivityFeed items={[]} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Chưa có hoạt động')).toBeTruthy();
    expect(
      screen.getByText(
        'Các cập nhật thu tiền và xử lý công nợ sẽ hiển thị tại đây.',
      ),
    ).toBeTruthy();
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
      { wrapper: MemoryRouter },
    );
    expect(screen.getByText('Nhận thanh toán')).toBeTruthy();
    expect(screen.getByText('Nhận thanh toán 5.000.000 ₫')).toBeTruthy();
  });

  it('links each activity to the receivable it happened on', () => {
    render(
      <MemoryRouter>
        <RecentActivityFeed
          items={[
            {
              id: 'act-1',
              receivableId: 'rec-1',
              customerId: 'cust-1',
              activityType: 'PAYMENT_RECEIVED',
              description: 'Đã nhận thanh toán 5.000.000 ₫ cho khoản phải thu',
              createdAt: '2026-08-13T00:00:00Z',
            },
          ]}
        />
      </MemoryRouter>,
    );

    // The description alone ("… cho khoản phải thu") never said which one.
    const link = screen.getByRole('link', { name: /Nhận thanh toán/ });
    expect(link).toHaveAttribute('href', '/receivables/rec-1');
    // Every link reads "Nhận thanh toán"; screen readers need the detail.
    expect(link).toHaveAccessibleDescription(
      'Đã nhận thanh toán 5.000.000 ₫ cho khoản phải thu',
    );
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
      { wrapper: MemoryRouter },
    );
    expect(screen.getByRole('time')).toHaveAttribute(
      'dateTime',
      '2026-08-13T00:00:00Z',
    );
    expect(screen.getByText('mô tả rất dài')).toHaveClass('break-words');
  });
});
