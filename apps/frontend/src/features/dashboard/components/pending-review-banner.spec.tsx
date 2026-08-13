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
});
