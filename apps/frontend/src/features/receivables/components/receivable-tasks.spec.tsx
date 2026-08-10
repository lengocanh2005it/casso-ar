import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReceivableTasks } from './receivable-tasks';

const apiRequest = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  postWithIdempotency: (url: string, data?: unknown, headers?: unknown) =>
    apiRequest({
      url,
      method: 'POST',
      data,
      headers: { 'Idempotency-Key': 'test-key', ...(headers as object) },
    }),
}));

const mockUseAuth = vi.fn();
vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

const task = {
  id: 't1',
  receivableId: 'r1',
  assignedToUserId: 'u1',
  createdByUserId: null,
  taskType: 'MANUAL' as const,
  title: 'Follow up',
  description: null,
  dueDate: null,
  status: 'OPEN' as const,
};

function renderTasks() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ReceivableTasks receivableId="r1" />
    </QueryClientProvider>,
  );
}

describe('ReceivableTasks', () => {
  it('hides Complete/Dismiss for a role without INTERNAL_TASK_MANAGE (SALES_REP has RECEIVABLE_READ only)', async () => {
    mockUseAuth.mockReturnValue({ user: { role: 'SALES_REP' } });
    apiRequest.mockResolvedValue({
      items: [task],
      total: 1,
      page: 1,
      limit: 100,
    });
    renderTasks();

    await waitFor(() =>
      expect(screen.getByText('Follow up')).toBeInTheDocument(),
    );
    expect(screen.queryByText('Complete')).not.toBeInTheDocument();
    expect(screen.queryByText('Dismiss')).not.toBeInTheDocument();
  });

  it('shows Complete/Dismiss for a role with INTERNAL_TASK_MANAGE', async () => {
    mockUseAuth.mockReturnValue({ user: { role: 'ACCOUNTANT' } });
    apiRequest.mockResolvedValue({
      items: [task],
      total: 1,
      page: 1,
      limit: 100,
    });
    renderTasks();

    await waitFor(() =>
      expect(screen.getByText('Follow up')).toBeInTheDocument(),
    );
    expect(screen.getByText('Complete')).toBeInTheDocument();
    expect(screen.getByText('Dismiss')).toBeInTheDocument();
  });
});
