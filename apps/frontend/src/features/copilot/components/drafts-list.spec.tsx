import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as draftsApi from '../api/copilot-drafts-api';
import { DraftsList } from './drafts-list';

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe('DraftsList', () => {
  beforeEach(() => {
    vi.spyOn(draftsApi, 'fetchCopilotDrafts').mockResolvedValue({
      items: [
        {
          id: 'draft-1',
          receivableId: 'rec-1',
          recipientEmail: 'ap@abc.vn',
          subject: 'Nhắc thanh toán',
          bodyHtml: '<p>Nội dung</p>',
          status: 'DRAFTED',
          pendingActionId: null,
          createdAt: '2026-08-21T10:00:00Z',
        },
      ],
      total: 1,
    });
  });

  it('shows the subject, recipient, status, and email preview together', async () => {
    renderWithClient(<DraftsList canSendManual={false} />);

    expect(await screen.findByText('Nhắc thanh toán')).toBeInTheDocument();
    expect(screen.getByText('ap@abc.vn')).toBeInTheDocument();
    expect(screen.getByText('Chưa gửi đề xuất')).toBeInTheDocument();
    expect(screen.queryByText('Bản nháp email')).not.toBeInTheDocument();
    expect(screen.getByTitle('Xem trước email')).toBeInTheDocument();
  });

  it('hides the pager when every draft fits on one page', async () => {
    renderWithClient(<DraftsList canSendManual={false} />);

    expect(await screen.findByText('Nhắc thanh toán')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Trước' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sau' })).toBeNull();
    expect(screen.queryByText(/Trang 1/)).toBeNull();
  });

  it('pages through drafts past the first twenty', async () => {
    vi.mocked(draftsApi.fetchCopilotDrafts).mockResolvedValue({
      items: [
        {
          id: 'draft-1',
          receivableId: 'rec-1',
          recipientEmail: 'ap@abc.vn',
          subject: 'Nhắc thanh toán',
          bodyHtml: '<p>Nội dung</p>',
          status: 'DRAFTED',
          pendingActionId: null,
          createdAt: '2026-08-21T10:00:00Z',
        },
      ],
      total: 21,
    });

    renderWithClient(<DraftsList canSendManual={false} />);

    expect(await screen.findByText('Trang 1/2')).toBeInTheDocument();
    expect(draftsApi.fetchCopilotDrafts).toHaveBeenCalledWith(1, 20, undefined);
    expect(screen.getByRole('button', { name: 'Trước' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Sau' }));

    expect(await screen.findByText('Trang 2/2')).toBeInTheDocument();
    expect(draftsApi.fetchCopilotDrafts).toHaveBeenCalledWith(2, 20, undefined);
    expect(screen.getByRole('button', { name: 'Sau' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Trước' }));

    expect(await screen.findByText('Trang 1/2')).toBeInTheDocument();
    expect(draftsApi.fetchCopilotDrafts).toHaveBeenLastCalledWith(
      1,
      20,
      undefined,
    );
  });

  it('labels the pager as navigation with plain buttons', async () => {
    vi.mocked(draftsApi.fetchCopilotDrafts).mockResolvedValue({
      items: [
        {
          id: 'draft-1',
          receivableId: 'rec-1',
          recipientEmail: 'ap@abc.vn',
          subject: 'Nhắc thanh toán',
          bodyHtml: '<p>Nội dung</p>',
          status: 'DRAFTED',
          pendingActionId: null,
          createdAt: '2026-08-21T10:00:00Z',
        },
      ],
      total: 21,
    });

    renderWithClient(<DraftsList canSendManual={false} />);

    const nav = await screen.findByRole('navigation', {
      name: 'Phân trang bản nháp',
    });
    expect(nav).toHaveTextContent('Trang 1/2');
    for (const button of screen.getAllByRole('button', {
      name: /Trước|Sau/,
    })) {
      expect(button).toHaveAttribute('type', 'button');
    }
  });

  it('clamps back to a page with rows after deleting the last draft of the last page', async () => {
    const draft = (id: string, subject: string) => ({
      id,
      receivableId: 'rec-1',
      recipientEmail: 'ap@abc.vn',
      subject,
      bodyHtml: '<p>Nội dung</p>',
      status: 'DRAFTED' as const,
      pendingActionId: null,
      createdAt: '2026-08-21T10:00:00Z',
    });
    vi.mocked(draftsApi.fetchCopilotDrafts).mockImplementation(async (page) =>
      page === 1
        ? { items: [draft('draft-1', 'Còn lại')], total: 21 }
        : { items: [draft('draft-last', 'Bản nháp cuối')], total: 21 },
    );
    vi.spyOn(draftsApi, 'deleteCopilotDraft').mockResolvedValue({
      success: true,
    });

    renderWithClient(<DraftsList canSendManual />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sau' }));
    expect(await screen.findByText('Bản nháp cuối')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Xóa' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Xác nhận' }));

    expect(await screen.findByText('Trang 1/2')).toBeInTheDocument();
    expect(await screen.findByText('Còn lại')).toBeInTheDocument();
  });

  it('clamps back when a later page comes back empty', async () => {
    vi.mocked(draftsApi.fetchCopilotDrafts).mockImplementation(async (page) =>
      page === 1
        ? {
            items: [
              {
                id: 'draft-1',
                receivableId: 'rec-1',
                recipientEmail: 'ap@abc.vn',
                subject: 'Nhắc thanh toán',
                bodyHtml: '<p>Nội dung</p>',
                status: 'DRAFTED',
                pendingActionId: null,
                createdAt: '2026-08-21T10:00:00Z',
              },
            ],
            total: 21,
          }
        : { items: [], total: 21 },
    );

    renderWithClient(<DraftsList canSendManual={false} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sau' }));

    // The pager stays reachable instead of stranding the panel on "no drafts".
    expect(await screen.findByText('Trang 1/2')).toBeInTheDocument();
    expect(await screen.findByText('Nhắc thanh toán')).toBeInTheDocument();
    expect(
      screen.queryByRole('status', { name: /chưa có bản nháp email nào/i }),
    ).not.toBeInTheDocument();
  });

  it('keeps an errored page on screen with its retry instead of walking back', async () => {
    const draft = {
      id: 'draft-1',
      receivableId: 'rec-1',
      recipientEmail: 'ap@abc.vn',
      subject: 'Nhắc thanh toán',
      bodyHtml: '<p>Nội dung</p>',
      status: 'DRAFTED' as const,
      pendingActionId: null,
      createdAt: '2026-08-21T10:00:00Z',
    };
    vi.mocked(draftsApi.fetchCopilotDrafts).mockImplementation(async (page) => {
      if (page === 1) return { items: [draft], total: 21 };
      throw new Error('Drafts unavailable');
    });

    renderWithClient(<DraftsList canSendManual={false} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sau' }));

    // Walking back to page 1 would replace this error with a list nobody asked for.
    expect(
      await screen.findByRole('alert', {
        name: /không thể tải bản nháp email/i,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Nhắc thanh toán')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(draftsApi.fetchCopilotDrafts).toHaveBeenLastCalledWith(
      2,
      20,
      undefined,
    );
  });

  it('never flashes the empty state on the way back from an empty page', async () => {
    const draft = {
      id: 'draft-1',
      receivableId: 'rec-1',
      recipientEmail: 'ap@abc.vn',
      subject: 'Nhắc thanh toán',
      bodyHtml: '<p>Nội dung</p>',
      status: 'DRAFTED' as const,
      pendingActionId: null,
      createdAt: '2026-08-21T10:00:00Z',
    };
    vi.mocked(draftsApi.fetchCopilotDrafts).mockImplementation(async (page) =>
      page === 1 ? { items: [draft], total: 21 } : { items: [], total: 21 },
    );

    renderWithClient(<DraftsList canSendManual={false} />);
    const emptyStateFlashed = { value: false };
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.textContent?.includes('Chưa có bản nháp email nào.')) {
            emptyStateFlashed.value = true;
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    fireEvent.click(await screen.findByRole('button', { name: 'Sau' }));

    expect(await screen.findByText('Trang 1/2')).toBeInTheDocument();
    expect(await screen.findByText('Nhắc thanh toán')).toBeInTheDocument();
    observer.disconnect();
    expect(emptyStateFlashed.value).toBe(false);
  });

  it('shows the empty state without clamping when there are no drafts at all', async () => {
    const draft = {
      id: 'draft-1',
      receivableId: 'rec-1',
      recipientEmail: 'ap@abc.vn',
      subject: 'Nhắc thanh toán',
      bodyHtml: '<p>Nội dung</p>',
      status: 'DRAFTED' as const,
      pendingActionId: null,
      createdAt: '2026-08-21T10:00:00Z',
    };
    vi.mocked(draftsApi.fetchCopilotDrafts).mockImplementation(async (page) =>
      page === 1 ? { items: [draft], total: 21 } : { items: [], total: 0 },
    );

    renderWithClient(<DraftsList canSendManual={false} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sau' }));

    // total 0 means the list is genuinely empty, not a page that drifted.
    expect(
      await screen.findByRole('status', {
        name: /chưa có bản nháp email nào/i,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Trang 1\/1/)).not.toBeInTheDocument();
  });

  it('announces an empty drafts state', async () => {
    vi.spyOn(draftsApi, 'fetchCopilotDrafts').mockResolvedValue({
      items: [],
      total: 0,
    });

    renderWithClient(<DraftsList canSendManual={false} />);

    expect(
      await screen.findByRole('status', {
        name: /chưa có bản nháp email nào/i,
      }),
    ).toBeInTheDocument();
  });

  it('shows an error instead of the empty state when drafts cannot load', async () => {
    vi.spyOn(draftsApi, 'fetchCopilotDrafts').mockRejectedValue(
      new Error('Drafts unavailable'),
    );

    renderWithClient(<DraftsList canSendManual={false} />);

    expect(
      await screen.findByRole('alert', {
        name: /không thể tải bản nháp email/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('status', {
        name: /chưa có bản nháp email nào/i,
      }),
    ).not.toBeInTheDocument();
  });
});
