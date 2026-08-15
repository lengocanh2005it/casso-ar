import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LANDING_ABOUT } from '../landing-data';
import { AboutSection } from './about-section';

describe('AboutSection', () => {
  it('renders the intro paragraph and all value pillars', () => {
    render(<AboutSection />);

    expect(screen.getByText(LANDING_ABOUT.paragraph)).toBeInTheDocument();
    for (const pillar of LANDING_ABOUT.pillars) {
      expect(screen.getByText(pillar.label)).toBeInTheDocument();
    }
  });
});
