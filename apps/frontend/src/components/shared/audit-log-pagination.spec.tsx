import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuditLogPagination } from './audit-log-pagination';

describe('AuditLogPagination', () => {
  it('shows the page summary and calls onPrev/onNext', () => {
    const onPrev = vi.fn();
    const onNext = vi.fn();
    render(
      <AuditLogPagination
        page={2}
        totalPages={3}
        total={45}
        onPrev={onPrev}
        onNext={onNext}
      />,
    );

    expect(screen.getByText('Trang 2 / 3 • 45 nhật ký')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Trước' }));
    expect(onPrev).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Sau' }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('disables Trước on the first page and Sau on the last page', () => {
    render(
      <AuditLogPagination
        page={1}
        totalPages={1}
        total={5}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Trước' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Sau' })).toBeDisabled();
  });
});
