import { ReceivableStatus } from '@casso-ledger/shared-types';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ReceivableStatusBadge } from '@/components/receivable-status-badge';

describe('ReceivableStatusBadge', () => {
  it('renders the Vietnamese label for a partially paid receivable', () => {
    render(<ReceivableStatusBadge status={ReceivableStatus.PARTIALLY_PAID} />);

    expect(screen.getByText('Đã trả một phần')).toBeInTheDocument();
    expect(screen.getByText('Đã trả một phần')).toHaveClass(
      'bg-warning/10',
      'text-warning',
    );
  });
});
