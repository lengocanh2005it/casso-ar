import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CopilotReceivableList } from './copilot-receivable-list';

describe('CopilotReceivableList', () => {
  const rows = [
    {
      customerName: 'Công ty TNHH Dược phẩm Tâm An',
      invoiceNumber: 'HD-2026-0037',
      remainingAmount: '13.000.000',
      dueDate: '29/04/2026',
    },
    {
      customerName: 'Hợp tác xã Nông nghiệp Đồng Tâm',
      invoiceNumber: null,
      remainingAmount: '19.200.000',
      dueDate: '29/04/2026',
    },
  ];

  it('labels each figure instead of leaving a bare number', () => {
    render(<CopilotReceivableList rows={rows} />);

    expect(screen.getAllByText('Còn lại:')).toHaveLength(rows.length);
    expect(screen.getAllByText('Hạn:')).toHaveLength(rows.length);
    expect(screen.getAllByText('Hoá đơn:')).toHaveLength(rows.length);
    expect(screen.getByText('13.000.000')).toBeInTheDocument();
  });

  it('shows a placeholder instead of an empty invoice number', () => {
    render(<CopilotReceivableList rows={rows} />);

    expect(screen.getByText('HD-2026-0037')).toBeInTheDocument();
    expect(screen.getByText('Chưa có số hoá đơn')).toBeInTheDocument();
  });

  it('gives every row an accessible name built from its figures', () => {
    render(<CopilotReceivableList rows={rows} />);

    expect(
      screen.getByText('Công ty TNHH Dược phẩm Tâm An').closest('li'),
    ).toHaveTextContent('HD-2026-0037');
    expect(
      screen.getByText('Công ty TNHH Dược phẩm Tâm An').closest('li'),
    ).toHaveTextContent('13.000.000');
    expect(
      screen.getByText('Công ty TNHH Dược phẩm Tâm An').closest('li'),
    ).toBeInTheDocument();
  });

  it('never truncates a long customer name or invoice number', () => {
    render(
      <CopilotReceivableList
        rows={[
          {
            customerName:
              'Công ty TNHH Đầu tư và Xây dựng Phương Đông Việt Nam Trách Nhiệm Hữu Hạn',
            invoiceNumber: 'HD-2026-000123456789012345678',
            remainingAmount: '123.456.789.012',
            dueDate: '29/04/2026',
          },
        ]}
      />,
    );

    const row = screen.getByRole('listitem');
    expect(row.querySelector('[data-truncate="true"]')).toBeNull();
  });

  it('renders nothing when there is no receivable to show', () => {
    const { container } = render(<CopilotReceivableList rows={[]} />);

    expect(container.firstChild).toBeNull();
  });
});
