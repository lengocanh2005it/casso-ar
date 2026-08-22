import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HeroDemoCard } from './hero-demo-card';

describe('HeroDemoCard', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows the active demo transaction as a matched bank-to-receivable pair', () => {
    render(<HeroDemoCard />);

    expect(screen.getByText('Giao dịch ngân hàng')).toBeInTheDocument();
    expect(screen.getByText('Công nợ khớp')).toBeInTheDocument();
    expect(screen.getAllByText('Công ty TNHH Minh Phát')).toHaveLength(2);
  });

  it('cycles to the next demo transaction over time', () => {
    render(<HeroDemoCard />);
    expect(
      screen.getAllByText('Công ty TNHH Minh Phát').length,
    ).toBeGreaterThan(0);

    act(() => {
      vi.advanceTimersByTime(3200);
    });

    expect(screen.getAllByText('Cửa hàng Thanh Tâm').length).toBeGreaterThan(0);
    expect(
      screen.queryByText('Công ty TNHH Minh Phát'),
    ).not.toBeInTheDocument();
  });

  it('shows one progress indicator per demo transaction', () => {
    render(<HeroDemoCard />);

    expect(screen.getAllByTestId('hero-demo-progress-dot')).toHaveLength(3);
  });

  it('shows summary stats for matched volume and average match time', () => {
    render(<HeroDemoCard />);

    expect(screen.getByText('126')).toBeInTheDocument();
    expect(
      screen.getByText(/giao dịch đã khớp tháng này/i),
    ).toBeInTheDocument();
    expect(screen.getByText('~3s')).toBeInTheDocument();
    expect(screen.getByText(/thời gian khớp trung bình/i)).toBeInTheDocument();
  });
});
