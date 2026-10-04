import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as adminApi from '../api/admin-api';
import { AdminAiUsagePage } from './admin-ai-usage-page';

vi.mock('../api/admin-api');

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AdminAiUsagePage />
    </QueryClientProvider>,
  );
}

describe('AdminAiUsagePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches and displays the breakdown after submitting a date range', async () => {
    vi.mocked(adminApi.getAiUsage).mockResolvedValue({
      items: [
        {
          organizationId: 'org-1',
          organizationName: 'Acme',
          model: 'gpt-5.5',
          requestCount: 42,
          totalTokens: 1000,
          errorCount: 0,
        },
      ],
    });

    renderPage();

    fireEvent.change(screen.getByLabelText(/từ ngày/i), {
      target: { value: '2026-08-01' },
    });
    fireEvent.change(screen.getByLabelText(/đến ngày/i), {
      target: { value: '2026-08-07' },
    });
    fireEvent.click(screen.getByRole('button', { name: /xem/i }));

    await waitFor(() =>
      expect(adminApi.getAiUsage).toHaveBeenCalledWith(
        '2026-08-01',
        '2026-08-07',
      ),
    );
    expect(await screen.findByText('Acme')).toBeInTheDocument();
    expect(await screen.findByText('1.000')).toBeInTheDocument();
  });

  it('collapses the header on small screens so all five metrics stay reachable', async () => {
    vi.mocked(adminApi.getAiUsage).mockResolvedValue({
      items: [
        {
          organizationId: 'org-1',
          organizationName: 'Acme',
          model: 'gpt-5.5',
          requestCount: 42,
          totalTokens: 1000,
          errorCount: 3,
        },
      ],
    });

    renderPage();
    fireEvent.change(screen.getByLabelText(/từ ngày/i), {
      target: { value: '2026-08-01' },
    });
    fireEvent.change(screen.getByLabelText(/đến ngày/i), {
      target: { value: '2026-08-07' },
    });
    fireEvent.click(screen.getByRole('button', { name: /xem/i }));

    expect(await screen.findByText('Acme')).toBeInTheDocument();

    const [headerRow, dataRow] = screen.getAllByRole('row');
    expect(headerRow.parentElement).toHaveClass('max-md:hidden');
    expect(dataRow).toHaveClass('max-md:grid');
    // Model and the three counters fold into the row instead of scrolling off.
    expect(dataRow.textContent).toContain('gpt-5.5');
    expect(dataRow.textContent).toContain('42');
    expect(dataRow.textContent).toContain('1.000');
    expect(dataRow.textContent).toContain('3');
  });

  it('shows named date fields', () => {
    renderPage();

    expect(screen.getByLabelText(/từ ngày/i)).toHaveAttribute('name', 'from');
    expect(screen.getByLabelText(/đến ngày/i)).toHaveAttribute('name', 'to');
    expect(
      screen.getByRole('form', { name: /lọc mức sử dụng/i }),
    ).toBeInTheDocument();
  });

  it('loads the last 7 days on first paint so the table is never a dead empty state', async () => {
    vi.mocked(adminApi.getAiUsage).mockResolvedValue({ items: [] });

    renderPage();

    // No interaction: the operator lands on data, not on a dead "no data" table.
    await waitFor(() => expect(adminApi.getAiUsage).toHaveBeenCalledTimes(1));

    const [from, to] = vi.mocked(adminApi.getAiUsage).mock.calls[0];
    expect(to).toBe(new Date().toISOString().slice(0, 10));
    expect(from).toBe(
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    );
    // The inputs are pre-filled with the range actually being queried.
    expect(screen.getByLabelText(/từ ngày/i)).toHaveValue(from);
    expect(screen.getByLabelText(/đến ngày/i)).toHaveValue(to);
  });

  it('still shows an empty state when the selected range genuinely has no rows', async () => {
    vi.mocked(adminApi.getAiUsage).mockResolvedValue({ items: [] });

    renderPage();

    expect(screen.getByText(/chưa có dữ liệu sử dụng/i)).toBeInTheDocument();
  });

  it('gives the filter bar the same lifted card treatment as the enterprise app', () => {
    renderPage();

    // The enterprise filter bars sit on `shadow-sm` cards so they read as a
    // raised block instead of blending into the page background.
    expect(screen.getByRole('form', { name: /lọc mức sử dụng/i })).toHaveClass(
      'shadow-sm',
    );
    expect(screen.getByTestId('admin-ai-usage-table')).toHaveClass(
      'shadow-sm',
      'animate-fade-up',
    );
  });

  it('uses the ai header tone so the page is distinguishable at a glance', () => {
    renderPage();

    // Every admin page used `info`, which flattened the whole portal into one
    // visual register. AI usage now gets its own tone rather than aliasing the
    // brand green that the landing page uses.
    expect(screen.getByTestId('header-icon')).toHaveClass('text-info');
    expect(screen.getByTestId('header-icon')).toHaveClass('bg-info/15');
  });

  it('announces a failed query with a next step', async () => {
    vi.mocked(adminApi.getAiUsage).mockRejectedValue(new Error('network'));

    renderPage();
    fireEvent.change(screen.getByLabelText(/từ ngày/i), {
      target: { value: '2026-08-01' },
    });
    fireEvent.change(screen.getByLabelText(/đến ngày/i), {
      target: { value: '2026-08-07' },
    });
    fireEvent.click(screen.getByRole('button', { name: /xem/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /không thể tải dữ liệu sử dụng/i,
    );
  });
});
