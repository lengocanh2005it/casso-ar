import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { useAuth } from '@/contexts/auth-context';
import { ThemeProvider } from '@/contexts/theme-context';
import NotFoundPage from './not-found-page';

vi.mock('@/contexts/auth-context', () => ({ useAuth: vi.fn() }));

describe('NotFoundPage', () => {
  it('keeps the gradient 404 legible at the faded end', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isLoading: false,
      isAuthenticated: false,
    } as never);

    render(
      <ThemeProvider>
        <MemoryRouter>
          <NotFoundPage />
        </MemoryRouter>
      </ThemeProvider>,
    );

    const code = screen.getByText('404');
    const cls = String(code.className);

    // to-primary/50 over the card faded the gradient tail to 2.18:1 in the
    // light theme — under the 3.0 floor for 36px text. Fading to /70 holds
    // 3.4:1 while keeping the gradient.
    expect(cls).toMatch(/to-primary\/70/);
    expect(cls).not.toMatch(/to-primary\/50/);
  });
});
