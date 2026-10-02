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

  it('fills exactly one viewport so the next section starts at the fold', () => {
    // Sizing the hero to its content left 230px of "Xem Casso AR hoạt động"
    // inside the first screen, so the hero and the section below it shared one
    // frame. The hero has to claim the whole viewport.
    const { container } = render(
      <MemoryRouter>
        <HeroSection />
      </MemoryRouter>,
    );

    expect(container.querySelector('section')).toHaveClass('min-h-svh');
  });
});
