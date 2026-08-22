import { render, screen } from '@testing-library/react';
import { Users } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { EmptyState } from './empty-state';

describe('EmptyState', () => {
  it('renders copy, supplied action, decorative icon, and density variants', () => {
    const { rerender } = render(
      <EmptyState
        icon={Users}
        title="Chưa có khách hàng"
        description="Tạo khách hàng đầu tiên để bắt đầu theo dõi công nợ."
        action={<button type="button">Thêm khách hàng</button>}
      />,
    );

    expect(screen.getByText('Chưa có khách hàng')).toBeInTheDocument();
    expect(
      screen.getByText('Tạo khách hàng đầu tiên để bắt đầu theo dõi công nợ.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Thêm khách hàng' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('empty-state-icon')).toHaveAttribute(
      'aria-hidden',
      'true',
    );

    rerender(<EmptyState icon={Users} title="Rỗng" density="compact" />);
    expect(screen.getByTestId('empty-state')).toHaveClass('min-h-28');
  });
});
