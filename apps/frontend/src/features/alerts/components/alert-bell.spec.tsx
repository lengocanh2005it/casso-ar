import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AlertBell } from './alert-bell';

const { apiRequest, useAuth } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  useAuth: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));
vi.mock('@/contexts/auth-context', () => ({ useAuth }));

function renderBell() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <AlertBell />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('AlertBell', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders nothing when the current user is not OWNER, and never calls GET /alerts', async () => {
    useAuth.mockReturnValue({ user: { role: 'FINANCE_MANAGER' } });

    const { container } = renderBell();

    expect(container).toBeEmptyDOMElement();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('renders the bell with an aria-label including the unread count for OWNER', async () => {
    useAuth.mockReturnValue({ user: { role: 'OWNER' } });
    apiRequest.mockResolvedValue({ items: [], total: 0, unreadCount: 3 });

    renderBell();

    expect(
      await screen.findByRole('button', { name: 'Thông báo, 3 chưa đọc' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('status', { name: '3 thông báo chưa đọc' }),
    ).toBeInTheDocument();
  });

  it('renders the bell without an unread suffix when unreadCount is 0', async () => {
    useAuth.mockReturnValue({ user: { role: 'OWNER' } });
    apiRequest.mockResolvedValue({ items: [], total: 0, unreadCount: 0 });

    renderBell();

    expect(
      await screen.findByRole('button', { name: 'Thông báo' }),
    ).toBeInTheDocument();
  });

  it('shows the 99+ badge cap for large unread counts', async () => {
    useAuth.mockReturnValue({ user: { role: 'OWNER' } });
    apiRequest.mockResolvedValue({ items: [], total: 0, unreadCount: 150 });

    renderBell();

    expect(await screen.findByText('99+')).toBeInTheDocument();
  });

  it('uses responsive, origin-aware popover motion and press feedback', async () => {
    useAuth.mockReturnValue({ user: { role: 'OWNER' } });
    apiRequest.mockResolvedValue({ items: [], total: 0, unreadCount: 0 });

    renderBell();

    const trigger = await screen.findByRole('button', { name: 'Thông báo' });
    expect(trigger).toHaveClass(
      'pointer-hover:hover:bg-sidebar-accent',
      'active:scale-[0.97]',
    );

    fireEvent.click(trigger);

    await waitFor(() => {
      const content = document.querySelector('[data-slot="popover-content"]');
      expect(content).toHaveClass(
        'w-[calc(100vw-2rem)]',
        'max-w-80',
        'origin-(--radix-popover-content-transform-origin)',
      );
    });
  });
});
