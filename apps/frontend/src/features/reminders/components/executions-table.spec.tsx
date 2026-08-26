import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
    expect(screen.getByTitle('receivable-1')).toHaveAttribute(
      'title',
      'receivable-1',
    );
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
});
