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

  it('drives the branded band from theme-aware primary tokens with no dark overrides', () => {
    render(<StatsBand />);

    const region = screen.getByRole('region', {
      name: 'Vì sao chọn Casso AR?',
    });

    const card = region.firstElementChild?.firstElementChild as HTMLElement;
    // Same contract as the CTA card: primary/primary-foreground already flip
    // for dark mode, so no dark:text-white should be present.
    expect(card).toHaveClass(
      'rounded-3xl',
      'bg-primary',
      'text-primary-foreground',
    );
    expect(card).not.toHaveClass('dark:text-white');
    const copy = screen.getByText(
      'Những công cụ giúp bạn thu tiền đúng hạn và giảm thao tác thủ công.',
    );
    expect(copy).toHaveClass('text-primary-foreground/80');
    expect(copy).not.toHaveClass('dark:text-white/80');

    const highlightLabel = screen.getByText(LANDING_STAT_HIGHLIGHTS[0].label);
    expect(highlightLabel).toHaveClass('text-primary-foreground/90');
    expect(highlightLabel).not.toHaveClass('dark:text-white/90');
    expect(
      screen.getByRole('heading', { name: 'Vì sao chọn Casso AR?' }),
    ).toHaveAttribute('id', 'stats-band-title');
  });
});
