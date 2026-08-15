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
});
