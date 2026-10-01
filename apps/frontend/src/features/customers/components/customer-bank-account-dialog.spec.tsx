import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CustomerBankAccount } from '../types';
import { CustomerBankAccountDialog } from './customer-bank-account-dialog';

const apiRequest = vi.fn();
const postWithIdempotency = vi.fn();
const { toastSuccess } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  postWithIdempotency: (...args: unknown[]) => postWithIdempotency(...args),
  getApiErrorCode: (error: unknown) => {
    if (
      typeof error === 'object' &&
      error !== null &&
      'response' in error &&
      typeof (error as { response?: { data?: { errorCode?: unknown } } })
        .response?.data === 'object'
    ) {
      const code = (error as { response: { data: { errorCode?: unknown } } })
        .response.data.errorCode;
      return typeof code === 'string' ? code : undefined;
    }
    return undefined;
  },
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
  getApiErrorDetails: (error: unknown) => {
    if (
      typeof error === 'object' &&
      error !== null &&
      'response' in error &&
      typeof (error as { response?: { data?: { details?: unknown } } }).response
        ?.data === 'object'
    ) {
      const details = (error as { response: { data: { details?: unknown } } })
        .response.data.details;
      return typeof details === 'object' && details !== null
        ? (details as Record<string, unknown>)
        : undefined;
    }
    return undefined;
  },
}));

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
    );
  };
}

describe('CustomerBankAccountDialog', () => {
  let queryClient: QueryClient;
  const onOpenChange = vi.fn();

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    apiRequest.mockReset();
    postWithIdempotency.mockReset();
    toastSuccess.mockReset();
    onOpenChange.mockReset();
  });

  function renderCreateDialog() {
    return render(
      <CustomerBankAccountDialog
        customerId="customer-1"
        open={true}
        onOpenChange={onOpenChange}
      />,
      { wrapper: createWrapper(queryClient) },
    );
  }

  function renderEditDialog(
    accountOverrides: Partial<CustomerBankAccount> = {},
  ) {
    const account: CustomerBankAccount = {
      id: 'account-1',
      customerId: 'customer-1',
      accountNumberMasked: '******2233',
      isActive: true,
      createdAt: '2026-08-22T00:00:00.000Z',
      updatedAt: '2026-08-22T00:00:00.000Z',
      ...accountOverrides,
    };
    return render(
      <CustomerBankAccountDialog
        customerId="customer-1"
        account={account}
        open={true}
        onOpenChange={onOpenChange}
      />,
      { wrapper: createWrapper(queryClient) },
    );
  }

  it('requires an account number when creating', async () => {
    renderCreateDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Thêm' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Vui lòng nhập số tài khoản ngân hàng.',
    );
    expect(postWithIdempotency).not.toHaveBeenCalled();
  });

  it('explains that one account may belong to several customers', () => {
    renderCreateDialog();

    expect(
      screen.getByText(/một tài khoản có thể thuộc nhiều khách hàng/i),
    ).toBeInTheDocument();
  });

  it('submits a valid account number on create and closes dialog on success', async () => {
    postWithIdempotency.mockResolvedValueOnce({
      id: 'account-1',
      customerId: 'customer-1',
      accountNumberMasked: '******2233',
      isActive: true,
      createdAt: '2026-08-22T00:00:00.000Z',
      updatedAt: '2026-08-22T00:00:00.000Z',
    });

    renderCreateDialog();

    fireEvent.change(screen.getByLabelText('Số tài khoản ngân hàng'), {
      target: { value: '0011 2233' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm' }));

    await waitFor(() => {
      expect(postWithIdempotency).toHaveBeenCalledWith(
        '/api/v1/customers/customer-1/bank-accounts',
        { accountNumber: '0011 2233' },
      );
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(toastSuccess).toHaveBeenCalledWith('Đã thêm tài khoản ngân hàng.');
    });
  });

  it('keeps edit save disabled until a replacement is entered', async () => {
    renderEditDialog({ accountNumberMasked: '******2233' });

    expect(screen.getByRole('button', { name: 'Lưu thay đổi' })).toBeDisabled();
    expect(screen.getByText('******2233')).toBeInTheDocument();
  });

  it('submits updated account number on edit and closes dialog on success', async () => {
    apiRequest.mockResolvedValueOnce({
      id: 'account-1',
      customerId: 'customer-1',
      accountNumberMasked: '******4455',
      isActive: true,
      createdAt: '2026-08-22T00:00:00.000Z',
      updatedAt: '2026-08-22T00:00:00.000Z',
    });

    renderEditDialog({ accountNumberMasked: '******2233' });

    const input = screen.getByLabelText('Số tài khoản ngân hàng mới');
    fireEvent.change(input, { target: { value: '0011 4455' } });

    const saveButton = screen.getByRole('button', { name: 'Lưu thay đổi' });
    expect(saveButton).not.toBeDisabled();
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith({
        url: '/api/v1/customers/customer-1/bank-accounts/account-1',
        method: 'PATCH',
        data: { accountNumber: '0011 4455' },
        headers: { 'Idempotency-Key': expect.any(String) },
      });
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(toastSuccess).toHaveBeenCalledWith(
        'Đã cập nhật tài khoản ngân hàng.',
      );
    });
  });

  it('resets the replacement input when the edited account changes', () => {
    const firstAccount: CustomerBankAccount = {
      id: 'account-1',
      customerId: 'customer-1',
      accountNumberMasked: '******2233',
      isActive: true,
      createdAt: '2026-08-22T00:00:00.000Z',
      updatedAt: '2026-08-22T00:00:00.000Z',
    };
    const secondAccount = {
      ...firstAccount,
      id: 'account-2',
      accountNumberMasked: '******8899',
    };
    const view = render(
      <CustomerBankAccountDialog
        customerId="customer-1"
        account={firstAccount}
        open={true}
        onOpenChange={onOpenChange}
      />,
      { wrapper: createWrapper(queryClient) },
    );

    fireEvent.change(screen.getByLabelText('Số tài khoản ngân hàng mới'), {
      target: { value: '0011 4455' },
    });
    view.rerender(
      <CustomerBankAccountDialog
        customerId="customer-1"
        account={secondAccount}
        open={true}
        onOpenChange={onOpenChange}
      />,
    );

    expect(screen.getByLabelText('Số tài khoản ngân hàng mới')).toHaveValue('');
    expect(screen.getByText('******8899')).toBeInTheDocument();
  });

  it('explains that duplicate accounts should be restored inline', async () => {
    postWithIdempotency.mockRejectedValueOnce({
      response: {
        data: {
          errorCode: 'CONFLICT',
          message: 'Số tài khoản ngân hàng đã được liên kết.',
        },
      },
    });
    renderCreateDialog();

    fireEvent.change(screen.getByLabelText('Số tài khoản ngân hàng'), {
      target: { value: '0011 2233' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Số tài khoản ngân hàng đã được liên kết.',
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Nếu tài khoản đang vô hiệu hóa, hãy khôi phục tài khoản đó thay vì tạo mới.',
    );
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('shows a cross-customer confirmation and resubmits with acknowledgeExistingLinks', async () => {
    const conflict = {
      response: {
        data: {
          errorCode: 'CONFLICT',
          message: 'Số tài khoản này đang liên kết với khách hàng khác.',
          details: { linkedCustomerNames: ['Công ty B'] },
        },
      },
    };
    postWithIdempotency
      .mockRejectedValueOnce(conflict)
      .mockResolvedValueOnce({ id: 'a1' });

    renderCreateDialog();

    fireEvent.change(screen.getByLabelText('Số tài khoản ngân hàng'), {
      target: { value: '0123456789' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm' }));

    expect(await screen.findByText(/đang liên kết với/i)).toBeInTheDocument();
    expect(screen.getByText(/Công ty B/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /vẫn liên kết/i }));

    await waitFor(() => {
      expect(postWithIdempotency).toHaveBeenLastCalledWith(
        '/api/v1/customers/customer-1/bank-accounts',
        { accountNumber: '0123456789', acknowledgeExistingLinks: true },
      );
    });
  });

  it('keeps the plain inline hint for a same-customer conflict (no linkedCustomerNames)', async () => {
    postWithIdempotency.mockRejectedValueOnce({
      response: {
        data: {
          errorCode: 'CONFLICT',
          message: 'Số tài khoản ngân hàng đã được liên kết.',
        },
      },
    });

    renderCreateDialog();
    fireEvent.change(screen.getByLabelText('Số tài khoản ngân hàng'), {
      target: { value: '0123456789' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'đã được liên kết',
    );
    expect(screen.queryByRole('button', { name: /vẫn liên kết/i })).toBeNull();
  });

  it('shows a cross-customer confirmation on edit and resubmits with update mutation', async () => {
    const existingAccount: CustomerBankAccount = {
      id: 'account-1',
      customerId: 'customer-1',
      accountNumberMasked: '******2233',
      isActive: true,
      createdAt: '2026-08-22T00:00:00.000Z',
      updatedAt: '2026-08-22T00:00:00.000Z',
    };
    const conflict = {
      response: {
        data: {
          errorCode: 'CONFLICT',
          message: 'Số tài khoản này đang liên kết với khách hàng khác.',
          details: { linkedCustomerNames: ['Công ty B'] },
        },
      },
    };
    apiRequest
      .mockRejectedValueOnce(conflict)
      .mockResolvedValueOnce({ id: 'account-1' });

    render(
      <CustomerBankAccountDialog
        customerId="customer-1"
        account={existingAccount}
        open={true}
        onOpenChange={onOpenChange}
      />,
      { wrapper: createWrapper(queryClient) },
    );

    fireEvent.change(screen.getByLabelText('Số tài khoản ngân hàng mới'), {
      target: { value: '0123456789' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    expect(await screen.findByText(/đang liên kết với/i)).toBeInTheDocument();
    expect(screen.getByText(/Công ty B/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /vẫn liên kết/i }));

    await waitFor(() => {
      expect(apiRequest).toHaveBeenLastCalledWith(
        expect.objectContaining({
          url: '/api/v1/customers/customer-1/bank-accounts/account-1',
          method: 'PATCH',
          data: {
            accountNumber: '0123456789',
            acknowledgeExistingLinks: true,
          },
        }),
      );
    });
  });
});
