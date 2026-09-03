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
    expect(screen.getByTitle(receivableId)).toHaveTextContent('77b1de38…');
    expect(
      screen.getByText('Xác nhận gửi email nhắc thanh toán'),
    ).toBeInTheDocument();
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
