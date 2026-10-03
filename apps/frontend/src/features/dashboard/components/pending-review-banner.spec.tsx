import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { PendingReviewBanner } from './pending-review-banner';

describe('PendingReviewBanner', () => {
  it('renders nothing when there is no pending work', () => {
    const { container } = render(
      <MemoryRouter>
        <PendingReviewBanner pendingCount={0} />
      </MemoryRouter>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the count and a link to the exception queue when work is pending', () => {
    render(
      <MemoryRouter>
        <PendingReviewBanner pendingCount={12} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/12/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Xử lý ngay/i })).toHaveAttribute(
      'href',
      '/exceptions',
    );
  });

  it('announces itself as a live region when it appears', () => {
    render(
      <MemoryRouter>
        <PendingReviewBanner pendingCount={2} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('2');
  });

  it('renders a count placeholder without exposing a pending count while loading', () => {
    const { container } = render(
      <MemoryRouter>
        <PendingReviewBanner pendingCount={0} loading />
      </MemoryRouter>,
    );

    expect(
      container.querySelector('[data-slot="skeleton"]'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/giao dịch đang chờ đối soát/),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Xử lý ngay/i })).toHaveAttribute(
      'href',
      '/exceptions',
    );
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });
});
