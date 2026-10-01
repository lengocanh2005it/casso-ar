import { PlanId } from '@casso-ar/shared-types';
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
  it('announces that pricing is loading while the plan request is pending', () => {
    vi.mocked(apiRequest).mockReturnValue(new Promise(() => {}));

    renderWithProviders();

    expect(screen.getByText('Đang tải bảng giá…')).toBeInTheDocument();
  });

  it('announces when the plan request fails', async () => {
    vi.mocked(apiRequest).mockRejectedValue(new Error('Request failed'));

    renderWithProviders();

    expect(
      await screen.findByText('Không thể tải bảng giá. Vui lòng thử lại sau.'),
    ).toBeInTheDocument();
  });

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
      expect(screen.getByText('Chuyên nghiệp')).toBeInTheDocument(),
    );
    expect(
      screen.getByText('Mọi tính năng của gói Khởi đầu'),
    ).toBeInTheDocument();
    expect(screen.getByText(/999.000/)).toBeInTheDocument();
    expect(screen.getByText('Phổ biến nhất')).toBeInTheDocument();
  });
});
