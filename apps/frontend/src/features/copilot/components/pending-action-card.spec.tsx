import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PendingActionCard } from './pending-action-card';

describe('PendingActionCard', () => {
  it('uses the business receivable label and keeps the technical ID secondary', () => {
    const receivableId = '77b1de38-2ace-4b6d-b6b3-cf81d70b1024';

    render(
      <PendingActionCard
        action={{
          id: 'action-1',
          payload: { draftId: 'draft-1', receivableId },
          receivableLabel: 'INV-2026-001 — Công ty An Phát',
        }}
        busy={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(
      screen.getByText('INV-2026-001 — Công ty An Phát'),
    ).toBeInTheDocument();
    expect(screen.getByText('Mã kỹ thuật:')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: `Sao chép mã ${receivableId}` }),
    ).toHaveTextContent('77b1de38…');
    expect(
      screen.getByText('Xác nhận gửi email nhắc thanh toán'),
    ).toBeInTheDocument();
  });

  it('shows progress on the confirm button while confirming', () => {
    render(
      <PendingActionCard
        action={{
          id: 'action-1',
          payload: { draftId: 'draft-1', receivableId: 'rec-1' },
          receivableLabel: null,
        }}
        busy
        busyAction="confirm"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const confirmButton = screen.getByRole('button', { name: 'Đang gửi…' });
    expect(confirmButton).toBeDisabled();
    expect(confirmButton.querySelector('svg')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    expect(confirmButton.querySelector('svg')).toHaveClass('animate-spin');
    expect(screen.getByRole('button', { name: 'Hủy' })).toBeDisabled();
  });

  it('shows progress on the cancel button while cancelling', () => {
    render(
      <PendingActionCard
        action={{
          id: 'action-1',
          payload: { draftId: 'draft-1', receivableId: 'rec-1' },
          receivableLabel: null,
        }}
        busy
        busyAction="cancel"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const cancelButton = screen.getByRole('button', { name: 'Đang hủy…' });
    expect(cancelButton).toBeDisabled();
    expect(cancelButton.querySelector('svg')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Xác nhận gửi' })).toBeDisabled();
  });

  it('keeps both labels plain when neither action is running', () => {
    render(
      <PendingActionCard
        action={{
          id: 'action-1',
          payload: { draftId: 'draft-1', receivableId: 'rec-1' },
          receivableLabel: null,
        }}
        busy={false}
        busyAction={null}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Xác nhận gửi' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Hủy' })).toBeEnabled();
  });

  it('uses a Vietnamese fallback instead of exposing a missing receivable ID', () => {
    render(
      <PendingActionCard
        action={{
          id: 'action-1',
          payload: {
            draftId: 'draft-1',
            receivableId: '77b1de38-2ace-4b6d-b6b3-cf81d70b1024',
          },
          receivableLabel: null,
        }}
        busy={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText('Khoản phải thu')).toBeInTheDocument();
  });
});
