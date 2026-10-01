import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { CustomerTable } from './customer-table';

describe('CustomerTable', () => {
  it('renders a descriptive empty state when no customers match', () => {
    render(
      <MemoryRouter>
        <CustomerTable customers={[]} isFiltered />
      </MemoryRouter>,
    );

    expect(screen.getByText('Chưa có khách hàng phù hợp')).toBeInTheDocument();
    expect(
      screen.getByText('Thử thay đổi từ khóa hoặc bộ lọc để xem thêm kết quả.'),
    ).toBeInTheDocument();
  });

  it('tells a new organization that customers come from invoice import', () => {
    render(
      <MemoryRouter>
        <CustomerTable customers={[]} canImport />
      </MemoryRouter>,
    );

    // There is no "create customer" form: import is how customers appear.
    expect(screen.getByText('Chưa có khách hàng nào')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Nhập hóa đơn' })).toHaveAttribute(
      'href',
      '/receivables',
    );
    expect(screen.queryByText(/bộ lọc/)).not.toBeInTheDocument();
  });

  it('hides the import action from roles that cannot import', () => {
    render(
      <MemoryRouter>
        <CustomerTable customers={[]} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Chưa có khách hàng nào')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Nhập hóa đơn' }),
    ).not.toBeInTheDocument();
  });

  it('keeps customer details in a readable mobile row layout', () => {
    render(
      <MemoryRouter>
        <CustomerTable
          customers={[
            {
              id: 'customer-1',
              name: 'Công ty TNHH Giải pháp Kho vận Việt Trung',
              taxCode: '0319999016',
              email: 'accounting@example.vn',
              phone: null,
              defaultPaymentTermDays: 30,
              creditLimit: null,
              priority: null,
              createdAt: '2026-09-29T07:53:00.000Z',
            },
          ]}
        />
      </MemoryRouter>,
    );

    expect(screen.getAllByRole('row')[1]).toHaveClass('max-md:grid');
    const customerRow = screen.getAllByRole('row')[1];
    expect(within(customerRow).getByText('Mã số thuế')).toBeInTheDocument();
    expect(
      within(customerRow).getByText('Điều khoản thanh toán'),
    ).toBeInTheDocument();
  });
});
