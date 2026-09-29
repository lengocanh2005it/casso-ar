import { render, screen } from '@testing-library/react';
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
});
