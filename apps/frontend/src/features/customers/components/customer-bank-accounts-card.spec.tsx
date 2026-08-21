import { Role } from '@casso-ledger/shared-types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CustomerBankAccount } from '../types';
import { CustomerBankAccountsCard } from './customer-bank-accounts-card';

const { apiRequest, postWithIdempotency, useAuth } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  postWithIdempotency: vi.fn(),
  useAuth: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  postWithIdempotency: (...args: unknown[]) => postWithIdempotency(...args),
  getApiErrorMessage: (error: unknown) => {
    if (
      typeof error === 'object' &&
      error !== null &&
      'response' in error &&
      typeof (error as { response?: { data?: { message?: unknown } } }).response
        ?.data === 'object'
    ) {
      const msg = (error as { response: { data: { message?: unknown } } })
        .response.data.message;
      return typeof msg === 'string' ? msg : undefined;
    }
    return undefined;
  },
}));

vi.mock('@/contexts/auth-context', () => ({ useAuth }));

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
    );
  };
}

const activeAccount: CustomerBankAccount = {
  id: 'account-1',
  customerId: 'customer-1',
  accountNumberMasked: '******2233',
  isActive: true,
  createdAt: '2026-08-22T00:00:00.000Z',
  updatedAt: '2026-08-22T00:00:00.000Z',
};

const inactiveAccount: CustomerBankAccount = {
  id: 'account-2',
  customerId: 'customer-1',
  accountNumberMasked: '******8899',
  isActive: false,
  createdAt: '2026-08-22T00:00:00.000Z',
  updatedAt: '2026-08-22T00:00:00.000Z',
};

describe('CustomerBankAccountsCard', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    apiRequest.mockReset();
    postWithIdempotency.mockReset();
    useAuth.mockReturnValue({ user: { role: Role.OWNER } });
  });

  function renderCard(customerId = 'customer-1') {
    return render(<CustomerBankAccountsCard customerId={customerId} />, {
      wrapper: createWrapper(queryClient),
    });
  }

  it('hides write controls for a read-only role', async () => {
    useAuth.mockReturnValue({ user: { role: Role.VIEWER } });
    apiRequest.mockResolvedValueOnce({
      items: [activeAccount],
      total: 1,
    });

    renderCard();

    expect(await screen.findByText('******2233')).toBeInTheDocument();
    expect(screen.getByText('Đang hoạt động')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /thêm tài khoản/i }),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: /sửa/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /vô hiệu hóa/i })).toBeNull();
  });

  it('shows inactive status and a restore action', async () => {
    useAuth.mockReturnValue({ user: { role: Role.ACCOUNTANT } });
    apiRequest.mockResolvedValueOnce({
      items: [inactiveAccount],
      total: 1,
    });

    renderCard();

    expect(await screen.findByText('******8899')).toBeInTheDocument();
    expect(screen.getByText('Đã vô hiệu hóa')).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: `Khôi phục ${inactiveAccount.accountNumberMasked}`,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: `Sửa ${inactiveAccount.accountNumberMasked}`,
      }),
    ).toBeInTheDocument();
  });

  it('offers retry when the list request fails', async () => {
    useAuth.mockReturnValue({ user: { role: Role.VIEWER } });
    apiRequest.mockRejectedValueOnce(new Error('network'));

    renderCard();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không thể tải tài khoản ngân hàng.',
    );
    const retryButton = screen.getByRole('button', { name: 'Thử lại' });
    expect(retryButton).toBeInTheDocument();

    apiRequest.mockResolvedValueOnce({ items: [activeAccount], total: 1 });
    fireEvent.click(retryButton);

    expect(await screen.findByText('******2233')).toBeInTheDocument();
  });

  it('displays empty state and manage-only add button', async () => {
    useAuth.mockReturnValue({ user: { role: Role.OWNER } });
    apiRequest.mockResolvedValueOnce({ items: [], total: 0 });

    renderCard();

    expect(
      await screen.findByText('Khách hàng chưa có tài khoản ngân hàng nào.'),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: 'Thêm tài khoản' }),
    ).toHaveLength(2);
  });

  it('deactivates an active account after confirmation', async () => {
    useAuth.mockReturnValue({ user: { role: Role.OWNER } });
    apiRequest
      .mockResolvedValueOnce({
        items: [activeAccount],
        total: 1,
      })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        items: [{ ...activeAccount, isActive: false }],
        total: 1,
      });

    renderCard();

    expect(await screen.findByText('******2233')).toBeInTheDocument();
    const deactivateButton = screen.getByRole('button', {
      name: `Vô hiệu hóa ${activeAccount.accountNumberMasked}`,
    });
    fireEvent.click(deactivateButton);

    expect(
      await screen.findByText('Vô hiệu hóa tài khoản ngân hàng?'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Tài khoản này sẽ không còn được dùng để tự động đối soát, nhưng vẫn được giữ trong lịch sử khách hàng.',
      ),
    ).toBeInTheDocument();

    const confirmButton = screen.getByRole('button', { name: 'Vô hiệu hóa' });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith({
        url: `/api/v1/customers/customer-1/bank-accounts/${activeAccount.id}`,
        method: 'DELETE',
        headers: { 'Idempotency-Key': expect.any(String) },
      });
    });
  });

  it('cancels deactivation when clicking Hủy in confirmation', async () => {
    useAuth.mockReturnValue({ user: { role: Role.OWNER } });
    apiRequest.mockResolvedValueOnce({
      items: [activeAccount],
      total: 1,
    });

    renderCard();

    expect(await screen.findByText('******2233')).toBeInTheDocument();
    const deactivateButton = screen.getByRole('button', {
      name: `Vô hiệu hóa ${activeAccount.accountNumberMasked}`,
    });
    fireEvent.click(deactivateButton);

    expect(
      await screen.findByText('Vô hiệu hóa tài khoản ngân hàng?'),
    ).toBeInTheDocument();

    const cancelButton = screen.getByRole('button', { name: 'Hủy' });
    fireEvent.click(cancelButton);

    await waitFor(() => {
      expect(screen.queryByText('Vô hiệu hóa tài khoản ngân hàng?')).toBeNull();
    });
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });

  it('reactivates an inactive account after confirmation', async () => {
    useAuth.mockReturnValue({ user: { role: Role.OWNER } });
    apiRequest
      .mockResolvedValueOnce({
        items: [inactiveAccount],
        total: 1,
      })
      .mockResolvedValueOnce({ ...inactiveAccount, isActive: true })
      .mockResolvedValueOnce({
        items: [{ ...inactiveAccount, isActive: true }],
        total: 1,
      });

    renderCard();

    expect(await screen.findByText('******8899')).toBeInTheDocument();
    const restoreButton = screen.getByRole('button', {
      name: `Khôi phục ${inactiveAccount.accountNumberMasked}`,
    });
    fireEvent.click(restoreButton);

    expect(
      await screen.findByText('Khôi phục tài khoản ngân hàng?'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Tài khoản này sẽ được dùng lại để tự động đối soát sau khi khôi phục.',
      ),
    ).toBeInTheDocument();

    const confirmButton = screen.getByRole('button', { name: 'Khôi phục' });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith({
        url: `/api/v1/customers/customer-1/bank-accounts/${inactiveAccount.id}`,
        method: 'PATCH',
        data: { isActive: true },
        headers: { 'Idempotency-Key': expect.any(String) },
      });
    });
  });
});
