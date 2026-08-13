import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AlertPanel } from './alert-panel';

const apiRequest = vi.fn();
const navigate = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <AlertPanel />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('AlertPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the empty state when there are no alerts', async () => {
    apiRequest.mockResolvedValue({ items: [], total: 0, unreadCount: 0 });

    renderPanel();

    await waitFor(() =>
      expect(screen.getByText('Không có thông báo mới.')).toBeInTheDocument(),
    );
  });

  it('renders each alert with its mapped Vietnamese message and an unread indicator', async () => {
    apiRequest.mockResolvedValue({
      items: [
        {
          id: 'alert-1',
          type: 'SMTP_FAILED',
          entityType: 'smtp_config',
          entityId: 'smtp-1',
          isRead: false,
          createdAt: new Date().toISOString(),
        },
      ],
      total: 1,
      unreadCount: 1,
    });

    renderPanel();

    expect(
      await screen.findByText('Máy chủ email của bạn gửi thất bại'),
    ).toBeInTheDocument();
    expect(screen.getByText('Đánh dấu đã đọc tất cả')).toBeInTheDocument();
  });

  it('hides "Đánh dấu đã đọc tất cả" when unreadCount is 0', async () => {
    apiRequest.mockResolvedValue({
      items: [
        {
          id: 'alert-1',
          type: 'SMTP_FAILED',
          entityType: 'smtp_config',
          entityId: 'smtp-1',
          isRead: true,
          createdAt: new Date().toISOString(),
        },
      ],
      total: 1,
      unreadCount: 0,
    });

    renderPanel();

    await screen.findByText('Máy chủ email của bạn gửi thất bại');
    expect(
      screen.queryByText('Đánh dấu đã đọc tất cả'),
    ).not.toBeInTheDocument();
  });

  it('clicking a row body marks it read and navigates to its mapped route', async () => {
    apiRequest.mockImplementation(({ method }) => {
      if (method === 'GET') {
        return Promise.resolve({
          items: [
            {
              id: 'alert-1',
              type: 'SMTP_FAILED',
              entityType: 'smtp_config',
              entityId: 'smtp-1',
              isRead: false,
              createdAt: new Date().toISOString(),
            },
          ],
          total: 1,
          unreadCount: 1,
        });
      }
      return Promise.resolve({ success: true });
    });

    renderPanel();
    const row = await screen.findByText('Máy chủ email của bạn gửi thất bại');
    fireEvent.click(row);

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith({
        url: '/api/v1/alerts/alert-1/read',
        method: 'PATCH',
      }),
    );
    expect(navigate).toHaveBeenCalledWith('/settings?tab=smtp');
  });

  it('clicking the per-row [x] deletes it without a confirmation dialog', async () => {
    apiRequest.mockImplementation(({ method }) => {
      if (method === 'GET') {
        return Promise.resolve({
          items: [
            {
              id: 'alert-1',
              type: 'SMTP_FAILED',
              entityType: 'smtp_config',
              entityId: 'smtp-1',
              isRead: false,
              createdAt: new Date().toISOString(),
            },
          ],
          total: 1,
          unreadCount: 1,
        });
      }
      return Promise.resolve({ success: true });
    });

    renderPanel();
    await screen.findByText('Máy chủ email của bạn gửi thất bại');
    fireEvent.click(screen.getByRole('button', { name: 'Xoá thông báo' }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith({
        url: '/api/v1/alerts/alert-1',
        method: 'DELETE',
      }),
    );
  });

  it('"Xoá tất cả" opens a confirmation dialog before calling DELETE /alerts', async () => {
    apiRequest.mockImplementation(({ method }) => {
      if (method === 'GET') {
        return Promise.resolve({
          items: [
            {
              id: 'alert-1',
              type: 'SMTP_FAILED',
              entityType: 'smtp_config',
              entityId: 'smtp-1',
              isRead: false,
              createdAt: new Date().toISOString(),
            },
          ],
          total: 1,
          unreadCount: 1,
        });
      }
      return Promise.resolve({ success: true });
    });

    renderPanel();
    await screen.findByText('Máy chủ email của bạn gửi thất bại');
    fireEvent.click(screen.getByRole('button', { name: 'Xoá tất cả' }));

    expect(
      await screen.findByText('Xoá tất cả thông báo?'),
    ).toBeInTheDocument();
    expect(apiRequest).not.toHaveBeenCalledWith(
      expect.objectContaining({ url: '/api/v1/alerts', method: 'DELETE' }),
    );

    const dialogActions = screen.getAllByRole('button', { name: 'Xoá tất cả' });
    fireEvent.click(dialogActions[dialogActions.length - 1]);
  });
});
