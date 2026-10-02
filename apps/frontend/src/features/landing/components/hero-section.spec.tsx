import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { HeroSection } from './hero-section';

describe('HeroSection', () => {
  it('renders the fixed headline prefix and CTA links', () => {
    render(
      <MemoryRouter>
        <HeroSection />
      </MemoryRouter>,
    );

    expect(screen.getByText(/thu tiền/i)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /dùng thử miễn phí/i }),
    ).toHaveAttribute('href', '/signup');
  });

  it('fills the space under the CTAs with a reassurance strip', () => {
    // The demo card is 142px taller than the text column, which left ~71px of
    // dead space under the buttons at desktop widths. A short strip of
    // verifiable facts closes that gap without inventing customer names.
    render(
      <MemoryRouter>
        <HeroSection />
      </MemoryRouter>,
    );

    expect(screen.getByRole('list', { name: /cam kết/i })).toBeInTheDocument();
  });

  it('sizes the hero to its content instead of forcing a full viewport', () => {
    // `min-h-svh` held the hero at 900px while its content was only 462px,
    // pushing 438px of empty page below the fold.
    const { container } = render(
      <MemoryRouter>
        <HeroSection />
      </MemoryRouter>,
    );

    expect(container.querySelector('section')).not.toHaveClass('min-h-svh');
  });
});
