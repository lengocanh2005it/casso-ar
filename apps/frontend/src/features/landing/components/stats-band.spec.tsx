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

    expect(
      screen.getByRole('region', { name: 'Vì sao chọn Casso Ledger?' }),
    ).toHaveClass('bg-primary', 'text-primary-foreground');
    expect(
      screen.getByRole('heading', { name: 'Vì sao chọn Casso Ledger?' }),
    ).toHaveAttribute('id', 'stats-band-title');
  });
});
