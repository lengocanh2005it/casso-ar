import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ThemeProvider } from '@/contexts/theme-context';
import { LandingNavbar } from './landing-navbar';

describe('LandingNavbar', () => {
  it('keeps the desktop logo wordmark inline with its icon', () => {
    render(
      <ThemeProvider>
        <MemoryRouter>
          <LandingNavbar />
        </MemoryRouter>
      </ThemeProvider>,
    );

    expect(screen.getByText('Casso AR').parentElement).toHaveClass(
      'sm:inline-flex',
    );
  });

  it('uses the green wordmark in the desktop header', () => {
    render(
      <ThemeProvider>
        <MemoryRouter>
          <LandingNavbar />
        </MemoryRouter>
      </ThemeProvider>,
    );

    expect(screen.getByText('Casso AR')).toHaveClass('text-primary');
  });

  it('opens the mobile menu with signup and login links', async () => {
    render(
      <ThemeProvider>
        <MemoryRouter>
          <LandingNavbar />
        </MemoryRouter>
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /mở menu/i }));

    expect(screen.getByRole('link', { name: /đăng nhập/i })).toHaveAttribute(
      'href',
      '/login',
    );
    expect(
      screen.getByRole('link', { name: /dùng thử miễn phí/i }),
    ).toHaveAttribute('href', '/signup');
  });

  it('pads the mobile menu content instead of running it flush to the edge', () => {
    render(
      <ThemeProvider>
        <MemoryRouter>
          <LandingNavbar />
        </MemoryRouter>
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /mở menu/i }));

    expect(screen.getByRole('dialog')).toHaveClass('p-6');
  });

  it('keeps the theme toggle reachable inside the mobile menu', () => {
    render(
      <ThemeProvider>
        <MemoryRouter>
          <LandingNavbar />
        </MemoryRouter>
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /mở menu/i }));

    expect(
      screen.getByRole('button', { name: /giao diện/i }),
    ).toBeInTheDocument();
  });

  it('keeps the inline nav closed until the header can fit it', () => {
    // At 768px the five nav links plus both CTAs measured 894px wide, so the
    // row overflowed by ~126px and `overflow-hidden` clipped the signup link
    // with no scrollbar to reveal it. The inline nav must wait for `lg`.
    render(
      <ThemeProvider>
        <MemoryRouter>
          <LandingNavbar />
        </MemoryRouter>
      </ThemeProvider>,
    );

    expect(screen.getByRole('navigation')).toHaveClass('lg:flex');
    expect(screen.getByRole('button', { name: /mở menu/i })).toHaveClass(
      'lg:hidden',
    );
  });
});
