import { render, screen, within } from '@testing-library/react';
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
    const signup = screen.getByRole('link', { name: /dùng thử miễn phí/i });
    expect(signup).toHaveAttribute('href', '/signup');
    expect(signup).toHaveClass(
      'pointer-hover:hover:bg-primary',
      'pointer-hover:hover:shadow-sm',
    );
    expect(signup).not.toHaveClass('pointer-hover:hover:bg-primary/90');
  });

  it('fills the space under the CTAs with a reassurance strip', () => {
    // Keep the trial commitments visible alongside the primary actions.
    render(
      <MemoryRouter>
        <HeroSection />
      </MemoryRouter>,
    );

    expect(screen.getByRole('list', { name: /cam kết/i })).toBeInTheDocument();
  });

  it('keeps wrapped reassurance text aligned with the check icon', () => {
    render(
      <MemoryRouter>
        <HeroSection />
      </MemoryRouter>,
    );

    const assurance = screen
      .getByText(/Không giới hạn khách hàng/)
      .closest('li');

    expect(assurance).toHaveClass('text-left');
  });

  it('keeps reassurance details at full muted-text contrast', () => {
    render(
      <MemoryRouter>
        <HeroSection />
      </MemoryRouter>,
    );

    expect(screen.getByText(/không cần thẻ/i)).not.toHaveClass(
      'text-muted-foreground/70',
    );
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

  it('shows an accessible stack of real product screens', () => {
    render(
      <MemoryRouter>
        <HeroSection />
      </MemoryRouter>,
    );

    const stack = screen.getByRole('figure', { name: /màn hình casso ar/i });
    const shots = within(stack).getAllByRole('img');

    expect(shots).toHaveLength(3);
    expect(
      within(stack).getByRole('img', { name: /tổng quan/i }),
    ).toHaveAttribute('src', '/hero-dashboard.png');
    expect(
      within(stack).getByRole('img', { name: /copilot/i }),
    ).toHaveAttribute('src', '/hero-copilot.png');
    expect(
      within(stack).getByRole('img', { name: /giao diện công nợ/i }),
    ).toHaveAttribute('src', '/hero-receivables.jpg');
  });

  it('adds a subtle hover lift to each product screen without affecting touch', () => {
    render(
      <MemoryRouter>
        <HeroSection />
      </MemoryRouter>,
    );

    const stack = screen.getByRole('figure', { name: /màn hình casso ar/i });
    const screenImages = within(stack).getAllByRole('img');

    for (const image of screenImages) {
      expect(image.parentElement).toHaveClass(
        'pointer-hover:hover:z-30',
        'motion-safe:pointer-hover:hover:scale-[1.025]',
        'motion-safe:pointer-hover:hover:-translate-y-1',
        'transition-[transform,translate,scale,box-shadow]',
        'motion-reduce:transition-none',
      );
    }
  });
});
