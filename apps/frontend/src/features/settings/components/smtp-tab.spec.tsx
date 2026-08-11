import { PlanId } from '@casso-ledger/shared-types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SmtpTab } from './smtp-tab';

const { apiRequest, useAuth } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  useAuth: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  postWithIdempotency: (url: string, data: unknown) =>
    apiRequest({ url, method: 'POST', data }),
}));
vi.mock('@/contexts/auth-context', () => ({ useAuth }));

let mockUser: { role: string; subscriptionPlan: PlanId };

function renderTab() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <SmtpTab />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('SmtpTab', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    useAuth.mockReset();
    mockUser = { role: 'OWNER', subscriptionPlan: PlanId.BUSINESS };
    useAuth.mockImplementation(() => ({ user: mockUser }));
  });

  it('shows the plan-locked card and does not call the API when below BUSINESS', () => {
    mockUser = { role: 'OWNER', subscriptionPlan: PlanId.STARTER };

    renderTab();

    expect(screen.getByText(/dành cho gói business/i)).toBeInTheDocument();
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('shows "Chưa cấu hình" and a configure button on 404', async () => {
    apiRequest.mockRejectedValueOnce({ response: { status: 404 } });

    renderTab();

    await waitFor(() =>
      expect(screen.getByText(/chưa cấu hình/i)).toBeInTheDocument(),
    );
    expect(
      screen.getByRole('button', { name: /cấu hình smtp/i }),
    ).toBeInTheDocument();
  });

  it('shows the CONNECTED status and its domain-sending explanation', async () => {
    apiRequest.mockResolvedValueOnce({
      host: 'smtp.congtyb.vn',
      port: 587,
      username: 'a@a.vn',
      fromAddress: 'a@a.vn',
      status: 'CONNECTED',
    });

    renderTab();

    await waitFor(() =>
      expect(screen.getByText('Đang hoạt động')).toBeInTheDocument(),
    );
    expect(screen.getByText('Đang hoạt động')).toHaveAttribute(
      'data-variant',
      'default',
    );
    expect(screen.getByText(/đang gửi từ domain của bạn/i)).toBeInTheDocument();
  });

  it('shows the FAILED status with the fallback explanation', async () => {
    apiRequest.mockResolvedValueOnce({
      host: 'smtp.congtyb.vn',
      port: 587,
      username: 'a@a.vn',
      fromAddress: 'a@a.vn',
      status: 'FAILED',
    });

    renderTab();

    await waitFor(() =>
      expect(screen.getByText('Gặp sự cố')).toBeInTheDocument(),
    );
    expect(screen.getByText('Gặp sự cố')).toHaveAttribute(
      'data-variant',
      'destructive',
    );
    expect(screen.getByText(/tạm gửi qua casso/i)).toBeInTheDocument();
  });

  it('requires AlertDialog confirmation before calling delete', async () => {
    apiRequest.mockImplementation((config: { method?: string }) =>
      config.method === 'GET'
        ? Promise.resolve({
            host: 'smtp.congtyb.vn',
            port: 587,
            username: 'a@a.vn',
            fromAddress: 'a@a.vn',
            status: 'CONNECTED',
          })
        : Promise.resolve({ success: true }),
    );

    renderTab();
    await waitFor(() =>
      expect(screen.getByText('Đang hoạt động')).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: /xoá cấu hình/i }));
    expect(apiRequest).toHaveBeenCalledTimes(1);

    fireEvent.click(
      screen.getByRole('button', { name: /xác nhận xoá cấu hình/i }),
    );
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
  });

  it('renders nothing and never calls the API without SMTP manage permission — GET itself requires it, unlike billing-tab', () => {
    mockUser = { role: 'VIEWER', subscriptionPlan: PlanId.BUSINESS };

    const { container } = renderTab();

    expect(container).toBeEmptyDOMElement();
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
