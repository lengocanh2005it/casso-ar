import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
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

  it('renders the draft body inside an EmailDraftPreview card', async () => {
    renderWithClient(<DraftsList canSendManual={false} />);

    expect(await screen.findByText('Nhắc thanh toán')).toBeInTheDocument();
    expect(screen.getByText('ap@abc.vn')).toBeInTheDocument();
    expect(screen.getByText('Bản nháp email')).toBeInTheDocument();
    expect(screen.getByTitle('Xem trước email')).toBeInTheDocument();
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
