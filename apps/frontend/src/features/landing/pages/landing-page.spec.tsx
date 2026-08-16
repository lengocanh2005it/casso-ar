import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/contexts/theme-context';
import { apiRequest } from '@/lib/api-client';
import { LandingPage } from './landing-page';

vi.mock('@/lib/api-client', () => ({ apiRequest: vi.fn() }));

describe('LandingPage', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it('renders every section', () => {
    vi.mocked(apiRequest).mockResolvedValue([]);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <MemoryRouter>
            <LandingPage />
          </MemoryRouter>
        </ThemeProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByText(/thu tiền/i)).toBeInTheDocument();
    expect(screen.getByText('Ba bước là xong')).toBeInTheDocument();
    expect(screen.getByText('Gói dịch vụ linh hoạt')).toBeInTheDocument();
  });
});
