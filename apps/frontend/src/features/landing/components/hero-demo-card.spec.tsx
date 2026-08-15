import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HeroDemoCard } from './hero-demo-card';

describe('HeroDemoCard', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('cycles to the next demo transaction after the interval elapses', () => {
    render(<HeroDemoCard />);

    expect(screen.getByText('Công ty TNHH Minh Phát')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(3200));

    expect(screen.getByText('Cửa hàng Thanh Tâm')).toBeInTheDocument();
  });
});
