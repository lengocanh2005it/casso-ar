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

    expect(await screen.findByText('Trang 1 / 2')).toBeInTheDocument();
    expect(draftsApi.fetchCopilotDrafts).toHaveBeenCalledWith(1, 20, undefined);
    expect(screen.getByRole('button', { name: 'Trước' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Sau' }));

    expect(await screen.findByText('Trang 2 / 2')).toBeInTheDocument();
    expect(draftsApi.fetchCopilotDrafts).toHaveBeenCalledWith(2, 20, undefined);
    expect(screen.getByRole('button', { name: 'Sau' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Trước' }));

    expect(await screen.findByText('Trang 1 / 2')).toBeInTheDocument();
    expect(draftsApi.fetchCopilotDrafts).toHaveBeenLastCalledWith(
      1,
      20,
      undefined,
    );
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
