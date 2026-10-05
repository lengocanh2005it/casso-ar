import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import * as adminApi from '../api/admin-api';
import { AdminOrganizationsPage } from './admin-organizations-page';

vi.mock('../api/admin-api');

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AdminOrganizationsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AdminOrganizationsPage', () => {
  it('collapses the table header on small screens and folds the extra columns into the name cell', async () => {
    vi.mocked(adminApi.listOrganizations).mockResolvedValue({
      items: [
        {
          id: 'org-1',
          name: 'Acme',
          status: 'ACTIVE',
          createdAt: '2026-08-01T00:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      limit: 50,
    });

    renderPage();

    expect(await screen.findByText('Acme')).toBeInTheDocument();

    // The 5-column grid cannot fit a 390px viewport, so the header row is
    // hidden and the secondary fields move into the name cell as labelled
    // lines — otherwise tax code / created date / status are unreachable.
    const [headerRow, dataRow] = screen.getAllByRole('row') as [
      HTMLTableRowElement,
      HTMLTableRowElement,
    ];
    expect(headerRow.parentElement).toHaveClass('max-md:hidden');
    expect(dataRow).toHaveClass('max-md:grid');
    // The name cell spans the full width; status and actions share the row
    // below it, so a phone shows one organization without extra scrolling.
    expect(dataRow.cells[0]).toHaveClass('max-md:col-span-3');
    // Tax code and created date stay reachable via the folded line.
    expect(dataRow.cells[0].textContent).toContain('Tạo');
  });

  it('lists organizations and locks one via the breaker switch', async () => {
    vi.mocked(adminApi.listOrganizations).mockResolvedValue({
      items: [
        {
          id: 'org-1',
          name: 'Acme',
          status: 'ACTIVE',
          createdAt: '2026-08-01T00:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      limit: 100,
    });
    vi.mocked(adminApi.lockOrganization).mockResolvedValue({
      status: 'LOCKED',
    });

    renderPage();

    expect(await screen.findByText('Acme')).toBeInTheDocument();
    expect(screen.getByTestId('header-icon')).toBeInTheDocument();
    expect(adminApi.listOrganizations).toHaveBeenCalledWith(1, 50, 'ALL');
    const toggle = screen.getByRole('switch', { name: /acme/i });
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(toggle);

    expect(await screen.findByRole('alertdialog')).toHaveClass(
      'overscroll-contain',
    );
    expect(adminApi.lockOrganization).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận khóa' }));

    await waitFor(() =>
      expect(adminApi.lockOrganization).toHaveBeenCalledWith('org-1'),
    );
  });

  it('shows the account status badge for every organization', async () => {
    vi.mocked(adminApi.listOrganizations).mockResolvedValue({
      items: [
        {
          id: 'org-1',
          name: 'Pending Co',
          status: 'PENDING_REVIEW',
          createdAt: '2026-08-01T00:00:00.000Z',
        },
        {
          id: 'org-2',
          name: 'Locked Co',
          status: 'LOCKED',
          createdAt: '2026-08-01T00:00:00.000Z',
        },
      ],
      total: 2,
      page: 1,
      limit: 50,
    });

    renderPage();

    // The status column carried only approve/reject buttons, so an operator
    // reading the list could not tell a locked org from an active one.
    expect(await screen.findByText('Chờ duyệt')).toBeInTheDocument();
    expect(screen.getByText('Đã khóa')).toBeInTheDocument();
    // Status and actions are now distinct columns, so the header no longer
    // mislabels the approve/reject buttons as the status.
    expect(screen.getByText('Thao tác')).toBeInTheDocument();
    expect(screen.queryByText('Trạng thái')).not.toBeInTheDocument();
  });

  it('matches the enterprise card treatment for the filter bar and table', async () => {
    vi.mocked(adminApi.listOrganizations).mockResolvedValue({
      items: [
        {
          id: 'org-1',
          name: 'Acme',
          status: 'ACTIVE',
          createdAt: '2026-08-01T00:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      limit: 50,
    });

    renderPage();

    // Enterprise list pages lift their filter and table with `shadow-sm`;
    // admin had neither, which is what made the portal read as cramped.
    expect(await screen.findByTestId('admin-organization-filter')).toHaveClass(
      'shadow-sm',
    );
    expect(await screen.findByTestId('admin-organization-table')).toHaveClass(
      'shadow-sm',
      'animate-fade-up',
    );
  });

  it('sizes the filter bar to its content instead of stretching it empty', async () => {
    vi.mocked(adminApi.listOrganizations).mockResolvedValue({
      items: [
        {
          id: 'org-1',
          name: 'Acme',
          status: 'ACTIVE',
          createdAt: '2026-08-01T00:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      limit: 50,
    });

    renderPage();

    // A single 224px dropdown inside a 1145px card left the bar looking like
    // an abandoned box, so the card hugs its content and reports the count.
    const filter = await screen.findByTestId('admin-organization-filter');
    expect(filter).toHaveClass('w-fit');
    expect(within(filter).getByText(/1 tổ chức/i)).toBeInTheDocument();
  });

  it('keeps the tax code and its match badge reachable on small screens', async () => {
    vi.mocked(adminApi.listOrganizations).mockResolvedValue({
      items: [
        {
          id: 'org-1',
          name: 'Acme',
          status: 'ACTIVE',
          taxCode: '0101234567',
          taxCodeMatched: false,
          createdAt: '2026-08-01T00:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      limit: 50,
    });

    renderPage();

    const dataRow = (
      await screen.findAllByRole('row')
    )[1] as HTMLTableRowElement;

    // These cells used `max-md:hidden`, which collapsed them to zero height on
    // a phone: the tax code and its match flag were simply gone. The name cell
    // now carries them as a labelled line, like the created date already did.
    expect(dataRow.cells[0].textContent).toContain('MST 0101234567');
    expect(dataRow.cells[0].textContent).toContain('Không khớp');
  });

  it('shows accessible loading and empty states', async () => {
    vi.mocked(adminApi.listOrganizations).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 100,
    });

    renderPage();

    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(await screen.findByText(/chưa có tổ chức nào/i)).toBeInTheDocument();
  });

  it('announces a failed organization load with retry', async () => {
    vi.mocked(adminApi.listOrganizations).mockRejectedValue(
      new Error('network'),
    );

    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /không thể tải danh sách tổ chức/i,
    );
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
  });

  it('keeps the switch label meaningful when an organization name is empty', async () => {
    vi.mocked(adminApi.listOrganizations).mockResolvedValue({
      items: [
        {
          id: 'org-1',
          name: '',
          status: 'ACTIVE',
          createdAt: '2026-08-01T00:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      limit: 100,
    });

    renderPage();

    expect(
      await screen.findByRole('switch', { name: /tổ chức này/i }),
    ).toBeInTheDocument();
  });

  it('links each organization row to its members page', async () => {
    vi.mocked(adminApi.listOrganizations).mockResolvedValue({
      items: [
        {
          id: 'org-1',
          name: 'Acme',
          status: 'ACTIVE',
          createdAt: '2026-08-01T00:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      limit: 100,
    });

    renderPage();

    expect(
      await screen.findByRole('link', { name: 'Thành viên' }),
    ).toHaveAttribute('href', '/admin/organizations/org-1/members');
  });

  it('paginates organizations through the URL without loading more than 50 rows', async () => {
    vi.mocked(adminApi.listOrganizations)
      .mockResolvedValueOnce({
        items: [
          {
            id: 'org-1',
            name: 'Acme',
            status: 'ACTIVE',
            createdAt: '2026-08-01T00:00:00.000Z',
          },
        ],
        total: 51,
        page: 1,
        limit: 50,
      })
      .mockResolvedValueOnce({
        items: [],
        total: 51,
        page: 2,
        limit: 50,
      });

    renderPage();

    expect(await screen.findByRole('button', { name: 'Sau' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Sau' }));

    await waitFor(() =>
      expect(adminApi.listOrganizations).toHaveBeenLastCalledWith(2, 50, 'ALL'),
    );
  });

  it('shows the tax-code match and approve/reject actions for a pending-review organization', async () => {
    vi.mocked(adminApi.listOrganizations).mockResolvedValue({
      items: [
        {
          id: 'org-1',
          name: 'Acme',
          status: 'PENDING_REVIEW',
          taxCode: '0101234567',
          taxCodeMatched: false,
          taxCodeLookupName: 'ACME KHAC',
          createdAt: '2026-08-01T00:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      limit: 100,
    });

    renderPage();

    expect(await screen.findByText('Acme')).toBeInTheDocument();
    expect(screen.getByText('0101234567')).toBeInTheDocument();
    expect(screen.getByText('ACME KHAC')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Duyệt' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Từ chối' })).toBeInTheDocument();
  });

  it('keeps a long lookup name on one line so rows stay the same height', async () => {
    const longLookupName =
      'Công ty Cổ phần Thương mại Dịch vụ Xuất Nhập Khẩu Tổng hợp Perf Test Rất Dài';
    vi.mocked(adminApi.listOrganizations).mockResolvedValue({
      items: [
        {
          id: 'org-1',
          name: 'Acme',
          status: 'ACTIVE',
          taxCode: '0101234567',
          taxCodeMatched: true,
          taxCodeLookupName: longLookupName,
          createdAt: '2026-08-01T00:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      limit: 100,
    });

    renderPage();

    const lookupName = await screen.findByText(longLookupName);
    // A legal Vietnamese name wraps to three lines at table width, which made
    // that row 85px tall against a 58px baseline and broke the scan rhythm.
    // The full name stays reachable through the tooltip.
    expect(lookupName).toHaveClass('truncate');
    // The reveal moved from the native `title` bubble to the app tooltip, so
    // hovering shows one themed popup instead of two stacked ones.
    expect(lookupName).not.toHaveAttribute('title');
    expect(lookupName).toHaveAttribute('data-tooltip-trigger');
  });

  it('rejects a pending organization with a required reason', async () => {
    vi.mocked(adminApi.listOrganizations).mockResolvedValue({
      items: [
        {
          id: 'org-1',
          name: 'Acme',
          status: 'PENDING_REVIEW',
          taxCode: '0101234567',
          taxCodeMatched: false,
          taxCodeLookupName: 'ACME KHAC',
          createdAt: '2026-08-01T00:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      limit: 100,
    });
    vi.mocked(adminApi.rejectOrganization).mockResolvedValue({
      status: 'REJECTED',
    });

    renderPage();

    expect(await screen.findByText('Acme')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Từ chối' }));

    const submitButton = await screen.findByRole('button', {
      name: 'Xác nhận từ chối',
    });
    expect(submitButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/lý do từ chối/i), {
      target: { value: 'MST không khớp' },
    });
    expect(submitButton).toBeEnabled();

    fireEvent.click(submitButton);

    await waitFor(() =>
      expect(adminApi.rejectOrganization).toHaveBeenCalledWith(
        'org-1',
        'MST không khớp',
      ),
    );
  });
});
