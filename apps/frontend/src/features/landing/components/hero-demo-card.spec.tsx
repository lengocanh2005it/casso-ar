import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HeroDemoCard } from './hero-demo-card';

describe('HeroDemoCard', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows every demo transaction at once', () => {
    render(<HeroDemoCard />);

    expect(screen.getByText('Công ty TNHH Minh Phát')).toBeInTheDocument();
    expect(screen.getByText('Cửa hàng Thanh Tâm')).toBeInTheDocument();
    expect(screen.getByText('Công ty CP Đại Dương')).toBeInTheDocument();
  });

  it('keeps the transaction list close to its heading', () => {
    render(<HeroDemoCard />);

    const card = screen
      .getByText('Giao dịch gần đây')
      .closest('[data-slot="card"]');

    expect(card).toHaveClass('gap-3');
  });
});
