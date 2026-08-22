import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LANDING_STAT_HIGHLIGHTS } from '../landing-data';
import { StatsBand } from './stats-band';

describe('StatsBand', () => {
  it('renders every feature-highlight label with no numeric claims', () => {
    render(<StatsBand />);

    for (const highlight of LANDING_STAT_HIGHLIGHTS) {
      expect(screen.getByText(highlight.label)).toBeInTheDocument();
    }
  });

  it('renders the highlights in a high-contrast branded band', () => {
    render(<StatsBand />);

    const region = screen.getByRole('region', {
      name: 'Vì sao chọn Casso Ledger?',
    });

    expect(region).toHaveClass('py-10', 'sm:py-14');
    expect(region).not.toHaveClass('bg-primary');
    expect(region.firstElementChild).toHaveClass('max-w-6xl');
    expect(region.firstElementChild?.firstElementChild).toHaveClass(
      'rounded-3xl',
      'bg-primary',
      'text-primary-foreground',
      'dark:text-white',
    );
    expect(
      screen.getByText(
        'Những công cụ giúp bạn thu tiền đúng hạn và giảm thao tác thủ công.',
      ),
    ).toHaveClass('dark:text-white/80');
    expect(screen.getByText(LANDING_STAT_HIGHLIGHTS[0].label)).toHaveClass(
      'dark:text-white/90',
    );
    expect(
      screen.getByRole('heading', { name: 'Vì sao chọn Casso Ledger?' }),
    ).toHaveAttribute('id', 'stats-band-title');
  });
});
