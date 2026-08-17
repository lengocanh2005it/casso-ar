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

    expect(screen.getByText('Casso Ledger').parentElement).toHaveClass(
      'sm:inline-flex',
    );
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
});
