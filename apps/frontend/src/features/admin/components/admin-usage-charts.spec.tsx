import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AdminUsageCharts } from './admin-usage-charts';

describe('AdminUsageCharts', () => {
  it('renders accessible empty states for both charts', () => {
    render(<AdminUsageCharts topOrganizations={[]} trend={[]} />);

    expect(screen.getByText(/tổ chức dùng ai nhiều nhất/i)).toBeInTheDocument();
    expect(screen.getByText(/xu hướng dùng ai theo ngày/i)).toBeInTheDocument();
    expect(screen.getAllByText(/chưa có dữ liệu usage/i)).toHaveLength(2);
    expect(screen.getAllByTestId('empty-state')).toHaveLength(2);
  });
});
