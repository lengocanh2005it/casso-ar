import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LANDING_ABOUT } from '../landing-data';
import { AboutSection } from './about-section';

describe('AboutSection', () => {
  it('renders the intro paragraph and all value pillars', () => {
    render(<AboutSection />);

    const fullParagraph = LANDING_ABOUT.paragraphSegments
      .map((segment) => segment.text)
      .join('');
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === 'P' && element.textContent === fullParagraph,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Casso Ledger', { selector: 'strong' }),
    ).toBeInTheDocument();
    for (const segment of LANDING_ABOUT.paragraphSegments.filter(
      (s) => 'bold' in s && s.bold,
    )) {
      expect(screen.getByText(segment.text).tagName).toBe('STRONG');
    }
    for (const pillar of LANDING_ABOUT.pillars) {
      expect(screen.getByText(pillar.label)).toBeInTheDocument();
    }
  });
});
