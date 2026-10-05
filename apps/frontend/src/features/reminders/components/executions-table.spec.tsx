import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { hoverTooltip } from '@/test/tooltip';
import type { ReminderExecution } from '../types';
import { ExecutionsTable } from './executions-table';

describe('ExecutionsTable', () => {
  it('shows the execution invoice and customer before its technical id', () => {
    const execution: ReminderExecution = {
      id: 'execution-1',
      receivableId: 'receivable-1',
      reminderRuleId: null,
      status: 'SENT',
      sentAt: '2026-08-20T08:00:00Z',
      skipReason: null,
      providerMessageId: null,
      invoiceNumber: 'INV-2026-001',
      customerName: 'Công ty An Phát',
    };

    render(<ExecutionsTable executions={[execution]} />);

    expect(
      screen.getByText('INV-2026-001 — Công ty An Phát'),
    ).toBeInTheDocument();
    // The full ID moved from a native `title` bubble to an app tooltip, so
    // the accessible name now carries the value instead.
    const technicalId = screen.getByRole('button', {
      name: 'Sao chép mã receivable-1',
    });
    expect(technicalId).toHaveTextContent('receivable-1'.slice(0, 8));
    expect(technicalId.closest('[data-tooltip-trigger]')).toBeInTheDocument();
  });

  it('uses a safe Vietnamese fallback for an unknown status', () => {
    const execution: ReminderExecution = {
      id: 'execution-unknown',
      receivableId: 'receivable-unknown',
      reminderRuleId: null,
      status: 'FUTURE_STATUS' as ReminderExecution['status'],
      sentAt: null,
      skipReason: null,
      providerMessageId: null,
      invoiceNumber: null,
      customerName: null,
    };

    render(<ExecutionsTable executions={[execution]} />);

    expect(screen.getByText('Trạng thái khác')).toBeInTheDocument();
    expect(screen.queryByText('FUTURE_STATUS')).not.toBeInTheDocument();
  });

  it('clips a long customer name so the row stays one line tall', async () => {
    const longName = `Công ty TNHH Công nghệ ${'X'.repeat(200)}`;
    const execution: ReminderExecution = {
      id: 'execution-long',
      receivableId: 'receivable-long',
      reminderRuleId: null,
      status: 'SENT',
      sentAt: '2026-08-20T08:00:00Z',
      skipReason: null,
      providerMessageId: null,
      invoiceNumber: 'PERF-2026-009999',
      customerName: longName,
    };

    render(<ExecutionsTable executions={[execution]} />);

    const label = screen.getByText(`PERF-2026-009999 — ${longName}`);
    expect(label).toHaveClass('block', 'truncate');
    await expect(hoverTooltip(label)).resolves.toBe(
      `PERF-2026-009999 — ${longName}`,
    );
  });
});
