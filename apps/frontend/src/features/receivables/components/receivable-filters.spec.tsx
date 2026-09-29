import { ReceivableStatus } from '@casso-ar/shared-types';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReceivableFilters } from './receivable-filters';

describe('ReceivableFilters', () => {
  it('tints a partially-paid filter with the readable warning ink', () => {
    render(
      <ReceivableFilters
        status={ReceivableStatus.PARTIALLY_PAID}
        onStatusChange={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('combobox', { name: 'Lọc theo trạng thái' }),
    ).toHaveClass('text-warning-strong');
  });
});
