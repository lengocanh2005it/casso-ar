import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LANDING_STEPS } from '../landing-data';
import { StepsSection } from './steps-section';

describe('StepsSection', () => {
  it('renders all three steps in order', () => {
    render(<StepsSection />);

    for (const step of LANDING_STEPS) {
      expect(screen.getByText(step.title)).toBeInTheDocument();
    }
  });
});
