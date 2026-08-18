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

  it('uses the green wordmark in the desktop header', () => {
    render(
      <ThemeProvider>
        <MemoryRouter>
          <LandingNavbar />
        </MemoryRouter>
      </ThemeProvider>,
    );

    expect(screen.getByText('Casso Ledger')).toHaveClass('text-primary');
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
});
