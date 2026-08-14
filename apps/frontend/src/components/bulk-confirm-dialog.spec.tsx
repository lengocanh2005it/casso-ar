import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BulkConfirmDialog } from './bulk-confirm-dialog';

describe('BulkConfirmDialog', () => {
  it('calls onConfirm when the confirm button is clicked and shows the pending label while pending', () => {
    const onConfirm = vi.fn();
    const { rerender } = render(
      <BulkConfirmDialog
        open
        onOpenChange={() => {}}
        title="Xóa nợ 3 khoản phải thu"
        description="Không thể hoàn tác thao tác này."
        confirmLabel="Xác nhận xóa nợ"
        confirmVariant="destructive"
        isPending={false}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByText('Xóa nợ 3 khoản phải thu')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận xóa nợ' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    rerender(
      <BulkConfirmDialog
        open
        onOpenChange={() => {}}
        title="Xóa nợ 3 khoản phải thu"
        description="Không thể hoàn tác thao tác này."
        confirmLabel="Xác nhận xóa nợ"
        confirmVariant="destructive"
        isPending
        onConfirm={onConfirm}
      />,
    );
    expect(screen.getByText('Đang xử lý…')).toBeInTheDocument();
  });
});
