import {
  PlanId,
  PlanPaymentHistoryProvenance,
  PlanPaymentHistorySourceType,
  PlanPaymentReceiptOutcome,
} from '@casso-ar/shared-types';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation, useSearchParams } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlanPaymentHistoryPage } from '../types';
import { PlanPaymentHistory } from './plan-payment-history';

const { usePlanPaymentHistory } = vi.hoisted(() => ({
  usePlanPaymentHistory: vi.fn(),
}));

vi.mock('../api/use-settings', () => ({ usePlanPaymentHistory }));

const historyPage = {
  items: [
    {
      paymentKind: PlanPaymentHistorySourceType.PLAN_UPGRADE_ORDER,
      orderCode: '9007199254740993',
      planId: PlanId.BUSINESS,
      receivedAmount: 999_000,
      initialOutcome: PlanPaymentReceiptOutcome.ACCEPTED,
      provenance: PlanPaymentHistoryProvenance.PAYOS_WEBHOOK,
      confirmedAt: '2026-08-20T07:05:00.000Z',
    },
    {
      paymentKind: PlanPaymentHistorySourceType.PERIOD_CHARGE,
      orderCode: '9007199254740994',
      planId: PlanId.STARTER,
      receivedAmount: null,
      initialOutcome: PlanPaymentReceiptOutcome.REVIEW_REQUIRED,
      provenance: PlanPaymentHistoryProvenance.LEGACY_BACKFILL,
      confirmedAt: '2026-08-19T07:05:00.000Z',
    },
  ],
  total: 2,
  page: 1,
  limit: 20,
};

function LocationText() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
    </output>
  );
}

function ChangeReturnedOrderButton() {
  const [searchParams, setSearchParams] = useSearchParams();
  return (
    <button
      type="button"
      onClick={() => {
        const next = new URLSearchParams(searchParams);
        next.set('orderCode', '9007199254740996');
        setSearchParams(next);
      }}
    >
      Return another order
    </button>
  );
}

describe('PlanPaymentHistory', () => {
  beforeEach(() => {
    usePlanPaymentHistory.mockReturnValue({
      data: historyPage,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
  });

  afterEach(() => vi.useRealTimers());

  it('shows received plan payments with confirmation time, shared labels and VND amounts', () => {
    render(
      <MemoryRouter initialEntries={['/settings?tab=billing']}>
        <PlanPaymentHistory />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('columnheader', { name: 'Thời gian xác nhận' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Gói' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Số tiền' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Loại' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', {
        name: 'Kết quả xác nhận ban đầu',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Mã đơn PayOS' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Chuyên nghiệp')).toBeInTheDocument();
    expect(screen.getByText('Nâng cấp gói')).toBeInTheDocument();
    expect(screen.getByText('Đã xác nhận')).toBeInTheDocument();
    expect(screen.getByText('999.000 ₫')).toBeInTheDocument();
    expect(screen.getByText('14:05 20/08/2026')).toBeInTheDocument();
    expect(screen.getByText('Không có dữ liệu')).toBeInTheDocument();
    expect(screen.getByText('Cần đối soát')).toBeInTheDocument();
    expect(screen.getByText('Gia hạn gói')).toBeInTheDocument();
    expect(screen.getByText('9007199254740993')).toBeInTheDocument();
  });

  it('announces loading until the history request completes', () => {
    usePlanPaymentHistory.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    });

    render(
      <MemoryRouter>
        <PlanPaymentHistory />
      </MemoryRouter>,
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'Đang tải lịch sử thanh toán',
    );
  });

  it('shows an empty state when the organization has no received plan payments', () => {
    usePlanPaymentHistory.mockReturnValue({
      data: { ...historyPage, items: [], total: 0 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(
      <MemoryRouter>
        <PlanPaymentHistory />
      </MemoryRouter>,
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'Chưa có lịch sử thanh toán.',
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('returns to the last available page when the URL page is out of range', async () => {
    usePlanPaymentHistory.mockImplementation(({ page }: { page: number }) => ({
      data: page === 3 ? { items: [], total: 5, page, limit: 20 } : historyPage,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    }));

    render(
      <MemoryRouter initialEntries={['/settings?tab=billing&page=3']}>
        <PlanPaymentHistory />
        <LocationText />
      </MemoryRouter>,
    );

    expect(await screen.findByText('9007199254740993')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/settings?tab=billing&page=1',
    );
  });

  it('shows a retry action when loading payment history fails', () => {
    const refetch = vi.fn();
    usePlanPaymentHistory.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      isFetching: false,
      refetch,
    });

    render(
      <MemoryRouter>
        <PlanPaymentHistory />
      </MemoryRouter>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Không thể tải lịch sử thanh toán.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('reads the page from the URL and updates it through shared pagination', () => {
    usePlanPaymentHistory.mockReturnValue({
      data: { ...historyPage, total: 61, page: 2 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/settings?tab=billing&page=2']}>
        <PlanPaymentHistory />
        <LocationText />
      </MemoryRouter>,
    );

    expect(
      usePlanPaymentHistory.mock.calls.some(
        ([query]) => query.page === 2 && query.limit === 20,
      ),
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Trước' }));

    expect(screen.getByTestId('location')).toHaveTextContent(
      '/settings?tab=billing&page=1',
    );
    expect(
      usePlanPaymentHistory.mock.calls.some(
        ([query]) => query.page === 1 && query.limit === 20,
      ),
    ).toBe(true);
  });

  it('checks return evidence on the first history page without changing pagination', async () => {
    vi.useFakeTimers();
    const refetch = vi.fn();
    usePlanPaymentHistory.mockImplementation((query) => ({
      data:
        query.page === 1
          ? { ...historyPage, total: 21 }
          : { ...historyPage, items: [], total: 21, page: 2 },
      isLoading: false,
      isError: false,
      refetch,
    }));

    render(
      <MemoryRouter
        initialEntries={[
          '/settings?tab=billing&page=2&status=PAID&orderCode=9007199254740993',
        ]}
      >
        <PlanPaymentHistory />
        <LocationText />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('location')).toHaveTextContent(
      '/settings?tab=billing&page=2',
    );
    expect(screen.getByRole('button', { name: 'Trước' })).toBeEnabled();
    expect(usePlanPaymentHistory).toHaveBeenCalledWith(
      { page: 1, limit: 20 },
      true,
    );
    await act(async () => vi.advanceTimersByTime(60_000));
    expect(refetch).not.toHaveBeenCalled();
  });

  it('accepts a matching return order already present on the visible later page', async () => {
    vi.useFakeTimers();
    const refetch = vi.fn();
    usePlanPaymentHistory.mockImplementation((query) => ({
      data:
        query.page === 2
          ? {
              ...historyPage,
              items: [historyPage.items[0]],
              total: 21,
              page: 2,
            }
          : { ...historyPage, items: [], total: 21 },
      isLoading: false,
      isError: false,
      refetch,
    }));

    render(
      <MemoryRouter
        initialEntries={[
          '/settings?tab=billing&page=2&status=PAID&orderCode=9007199254740993',
        ]}
      >
        <PlanPaymentHistory />
      </MemoryRouter>,
    );

    await act(async () => vi.advanceTimersByTime(60_000));
    expect(
      screen.queryByText('Chưa nhận được xác nhận thanh toán'),
    ).not.toBeInTheDocument();
    expect(refetch).not.toHaveBeenCalled();
  });

  it('does not treat a status query parameter as payment confirmation', async () => {
    vi.useFakeTimers();
    const refetch = vi.fn();
    usePlanPaymentHistory.mockReturnValue({
      data: { ...historyPage, items: [], total: 0 },
      isLoading: false,
      isError: false,
      refetch,
    });

    render(
      <MemoryRouter initialEntries={['/settings?tab=billing&status=success']}>
        <PlanPaymentHistory />
      </MemoryRouter>,
    );

    expect(screen.queryByText('Thanh toán thành công')).not.toBeInTheDocument();
    await act(async () => vi.advanceTimersByTime(60_000));
    expect(
      screen.queryByText('Chưa nhận được xác nhận thanh toán'),
    ).not.toBeInTheDocument();
    expect(refetch).not.toHaveBeenCalled();
  });

  it('shows a timeout and manual refresh when a returned order has no history row', async () => {
    vi.useFakeTimers();
    const refetch = vi.fn();
    usePlanPaymentHistory.mockReturnValue({
      data: { ...historyPage, items: [], total: 0 },
      isLoading: false,
      isError: false,
      refetch,
    });

    render(
      <MemoryRouter
        initialEntries={[
          '/settings?tab=billing&status=PAID&orderCode=9007199254740995',
        ]}
      >
        <PlanPaymentHistory />
      </MemoryRouter>,
    );

    await act(async () => vi.advanceTimersByTime(60_000));
    expect(
      screen.getByText('Chưa nhận được xác nhận thanh toán'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Làm mới' })).toBeInTheDocument();

    const pollCount = refetch.mock.calls.length;
    await act(async () => vi.advanceTimersByTime(5_000));
    expect(refetch).toHaveBeenCalledTimes(pollCount);
    fireEvent.click(screen.getByRole('button', { name: 'Làm mới' }));
    expect(refetch).toHaveBeenCalledTimes(pollCount + 1);
  });

  it('starts a fresh polling session when a different PayOS order returns', async () => {
    vi.useFakeTimers();
    const refetch = vi.fn();
    usePlanPaymentHistory.mockReturnValue({
      data: { ...historyPage, items: [], total: 0 },
      isLoading: false,
      isError: false,
      refetch,
    });

    render(
      <MemoryRouter
        initialEntries={[
          '/settings?tab=billing&status=PAID&orderCode=9007199254740995',
        ]}
      >
        <PlanPaymentHistory />
        <ChangeReturnedOrderButton />
      </MemoryRouter>,
    );

    await act(async () => vi.advanceTimersByTime(60_000));
    expect(
      screen.getByText('Chưa nhận được xác nhận thanh toán'),
    ).toBeInTheDocument();
    const previousPollCount = refetch.mock.calls.length;

    fireEvent.click(
      screen.getByRole('button', { name: 'Return another order' }),
    );
    expect(
      screen.queryByText('Chưa nhận được xác nhận thanh toán'),
    ).not.toBeInTheDocument();
    await act(async () => vi.advanceTimersByTime(5_000));
    expect(refetch).toHaveBeenCalledTimes(previousPollCount + 1);
  });

  it('stops waiting when the returned order code has a matching history row', async () => {
    vi.useFakeTimers();
    const refetch = vi.fn();
    usePlanPaymentHistory.mockReturnValue({
      data: historyPage,
      isLoading: false,
      isError: false,
      refetch,
    });

    render(
      <MemoryRouter
        initialEntries={[
          '/settings?tab=billing&status=PAID&orderCode=9007199254740993',
        ]}
      >
        <PlanPaymentHistory />
      </MemoryRouter>,
    );

    await act(async () => vi.advanceTimersByTime(60_000));
    expect(screen.queryByText('Chưa nhận được xác nhận thanh toán')).toBeNull();
    expect(refetch).not.toHaveBeenCalled();
  });

  it('refreshes history while checkout is open, then stops after 60 seconds', async () => {
    vi.useFakeTimers();
    const refetch = vi.fn();
    usePlanPaymentHistory.mockReturnValue({
      data: { ...historyPage, items: [], total: 0 },
      isLoading: false,
      isError: false,
      refetch,
    });

    render(
      <MemoryRouter>
        <PlanPaymentHistory checkoutUrl="https://pay.payos.vn/web/new-order" />
      </MemoryRouter>,
    );

    await act(async () => vi.advanceTimersByTime(5_000));
    expect(refetch).toHaveBeenCalledOnce();
    await act(async () => vi.advanceTimersByTime(55_000));
    expect(
      screen.getByText('Chưa nhận được xác nhận thanh toán'),
    ).toBeInTheDocument();
    const pollCount = refetch.mock.calls.length;
    await act(async () => vi.advanceTimersByTime(5_000));
    expect(refetch).toHaveBeenCalledTimes(pollCount);
  });

  it('does not show a missing-receipt warning when the open checkout has a review-required receipt', async () => {
    vi.useFakeTimers();
    const refetch = vi.fn();
    usePlanPaymentHistory.mockReturnValue({
      data: historyPage,
      isLoading: false,
      isError: false,
      refetch,
    });

    render(
      <MemoryRouter>
        <PlanPaymentHistory
          checkoutUrl="https://pay.payos.vn/web/new-order"
          checkoutOrderCode="9007199254740994"
        />
      </MemoryRouter>,
    );

    await act(async () => vi.advanceTimersByTime(60_000));
    expect(screen.queryByText('Chưa nhận được xác nhận thanh toán')).toBeNull();
    expect(refetch).not.toHaveBeenCalled();
  });

  it('keeps polling a new checkout when a previous returned order is already in history', async () => {
    vi.useFakeTimers();
    const refetch = vi.fn();
    usePlanPaymentHistory.mockReturnValue({
      data: historyPage,
      isLoading: false,
      isError: false,
      refetch,
    });

    render(
      <MemoryRouter
        initialEntries={[
          '/settings?tab=billing&status=PAID&orderCode=9007199254740993',
        ]}
      >
        <PlanPaymentHistory checkoutUrl="https://pay.payos.vn/web/new-order" />
      </MemoryRouter>,
    );

    await act(async () => vi.advanceTimersByTime(5_000));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('does not treat an unrelated history increase as confirmation for an open checkout', async () => {
    vi.useFakeTimers();
    const refetch = vi.fn();
    let data: PlanPaymentHistoryPage = { ...historyPage, items: [], total: 0 };
    usePlanPaymentHistory.mockImplementation(() => ({
      data,
      isLoading: false,
      isError: false,
      refetch,
    }));
    const { rerender } = render(
      <MemoryRouter>
        <PlanPaymentHistory checkoutUrl="https://pay.payos.vn/web/new-order" />
      </MemoryRouter>,
    );

    data = { ...historyPage, total: 1 };
    rerender(
      <MemoryRouter>
        <PlanPaymentHistory checkoutUrl="https://pay.payos.vn/web/new-order" />
      </MemoryRouter>,
    );

    await act(async () => vi.advanceTimersByTime(60_000));
    expect(
      screen.getByText('Chưa nhận được xác nhận thanh toán'),
    ).toBeInTheDocument();
    expect(refetch).toHaveBeenCalledTimes(12);
  });

  it('does not start the timeout notice for a cancelled PayOS return', async () => {
    vi.useFakeTimers();
    const refetch = vi.fn();
    usePlanPaymentHistory.mockReturnValue({
      data: { ...historyPage, items: [], total: 0 },
      isLoading: false,
      isError: false,
      refetch,
    });

    render(
      <MemoryRouter
        initialEntries={[
          '/settings?tab=billing&status=CANCELLED&cancel=true&orderCode=123',
        ]}
      >
        <PlanPaymentHistory />
      </MemoryRouter>,
    );

    await act(async () => vi.advanceTimersByTime(60_000));
    expect(screen.queryByText('Chưa nhận được xác nhận thanh toán')).toBeNull();
    expect(refetch).not.toHaveBeenCalled();
  });
});
