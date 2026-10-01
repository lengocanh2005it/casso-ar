import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ImportInvoicesDialog } from './import-invoices-dialog';

const importInvoices = vi.fn();

vi.mock('../api/import-api', () => ({
  importInvoices: (...args: unknown[]) => importInvoices(...args),
}));

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ user: { role: 'OWNER' } }),
}));

describe('ImportInvoicesDialog', () => {
  it('shows the selected invoice filename beside a localized picker', () => {
    render(<ImportInvoicesDialog />);
    fireEvent.click(screen.getByText('Nhập hóa đơn'));
    fireEvent.change(screen.getByLabelText('File hóa đơn'), {
      target: {
        files: [new File(['invoice'], 'invoices.csv', { type: 'text/csv' })],
      },
    });

    expect(
      screen.getByRole('button', { name: 'Chọn tệp hóa đơn' }),
    ).toBeInTheDocument();
    expect(screen.getByText('invoices.csv')).toBeInTheDocument();
  });

  it('renders failed rows after uploading a file', async () => {
    importInvoices.mockResolvedValue({
      totalRows: 3,
      successCount: 2,
      failedRows: [
        {
          rowNumber: 3,
          data: { customerName: 'Company C' },
          errors: ['DUPLICATE_INVOICE_NUMBER'],
        },
      ],
    });

    render(<ImportInvoicesDialog />);
    fireEvent.click(screen.getByText('Nhập hóa đơn'));
    fireEvent.change(screen.getByLabelText('File hóa đơn'), {
      target: {
        files: [new File(['invoice'], 'invoices.csv', { type: 'text/csv' })],
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tải lên' }));

    await waitFor(() =>
      expect(screen.getByText('Đã nhập thành công 2 dòng')).toBeInTheDocument(),
    );
    expect(screen.getByText('Số hóa đơn đã tồn tại')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});
