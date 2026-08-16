import { PlanId } from '@casso-ledger/shared-types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { apiRequest } from '@/lib/api-client';
import { PricingSection } from './pricing-section';

vi.mock('@/lib/api-client', () => ({ apiRequest: vi.fn() }));

function renderWithProviders() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PricingSection />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('PricingSection', () => {
  it('renders each plan with its price and marks BUSINESS as most popular', async () => {
    vi.mocked(apiRequest).mockResolvedValue([
      {
        planId: PlanId.FREE,
        priceVnd: 0,
        receivableMonthlyLimit: 50,
        bankConnectionLimit: 1,
        copilotChatMonthlyLimit: 50,
      },
      {
        planId: PlanId.BUSINESS,
        priceVnd: 999_000,
        receivableMonthlyLimit: 5000,
        bankConnectionLimit: 5,
        copilotChatMonthlyLimit: 1000,
      },
    ]);

    renderWithProviders();

    await waitFor(() =>
      expect(screen.getByText('Business')).toBeInTheDocument(),
    );
    expect(screen.getByText(/999.000/)).toBeInTheDocument();
    expect(screen.getByText('Phổ biến nhất')).toBeInTheDocument();
  });
});
