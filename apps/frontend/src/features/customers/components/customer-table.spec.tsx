import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { CustomerTable } from './customer-table';

describe('CustomerTable', () => {
  it('renders a descriptive empty state when no customers match', () => {
    render(
      <MemoryRouter>
        <CustomerTable customers={[]} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Chưa có khách hàng phù hợp')).toBeInTheDocument();
    expect(
      screen.getByText('Thử thay đổi từ khóa hoặc bộ lọc để xem thêm kết quả.'),
    ).toBeInTheDocument();
  });
});
