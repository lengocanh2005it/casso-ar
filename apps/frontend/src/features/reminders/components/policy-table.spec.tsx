import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReminderPolicy, ReminderRule } from '../types';
import { PolicyTable } from './policy-table';

const apiRequest = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));
vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ user: { role: 'ACCOUNTANT' } }),
}));

const rule = (index: number): ReminderRule => ({
  id: `rule-${index}`,
  offsetDays: -index,
  emailTemplateId: 'template-1',
  minIntervalDays: 7,
});

const POLICIES: ReminderPolicy[] = [
  {
    id: 'p-1',
    customerGroup: 'VIP',
    isActive: true,
    escalationThresholdDays: 30,
    rules: [rule(1), rule(2), rule(3), rule(4)],
    createdAt: '2026-09-29T07:53:00.000Z',
  },
  {
    id: 'p-2',
    customerGroup: 'REGULAR',
    isActive: true,
    escalationThresholdDays: 30,
    rules: [rule(1), rule(2), rule(3), rule(4)],
    createdAt: '2026-09-29T07:53:00.000Z',
  },
];

function renderTable() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PolicyTable policies={POLICIES} />
    </QueryClientProvider>,
  );
}

describe('PolicyTable', () => {
  // Below md the six-column table was wider than any phone viewport (648px of
  // content in a 293px card), so the whole queue scrolled sideways and the
  // status label wrapped one word per line. Each row must become the same
  // 3-column card the receivables and exceptions queues already use.
  it('stacks each policy into a card on phones instead of a 6-column table', () => {
    renderTable();

    const [headerRow, firstRow] = screen.getAllByRole('row');
    expect(headerRow.parentElement).toHaveClass('max-md:hidden');
    expect(firstRow).toHaveClass('max-md:grid');
  });

  it('keeps the status on one line and hides the columns that do not fit', () => {
    renderTable();

    const statusLabels = screen.getAllByText('Đang hoạt động');
    expect(statusLabels).toHaveLength(2);
    for (const label of statusLabels) {
      expect(label).toHaveClass('whitespace-nowrap');
    }

    // Counts, the escalation window and the created date keep their own
    // columns on desktop but must not force a 6-column grid onto a phone;
    // counts + threshold are folded into the group cell instead.
    const firstRowCells = screen.getAllByRole('row')[1].querySelectorAll('td');
    const hiddenOnMobile = [...firstRowCells].filter((cell) =>
      cell.className.includes('max-md:hidden'),
    );
    expect(hiddenOnMobile).toHaveLength(3);
    expect(screen.getAllByText(/4 quy tắc · leo thang 30 ngày/)).toHaveLength(
      2,
    );
  });
});
