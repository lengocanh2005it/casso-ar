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

  it.each([
    ['13000000', '13.000.000'],
    ['13000000 VNĐ', '13.000.000'],
    ['13,000,000', '13.000.000'],
    ['0', '0'],
  ])('groups the digits of "%s" into %s', (input, expected) => {
    render(
      <CopilotReceivableList
        rows={[
          {
            customerName: 'Công ty A',
            invoiceNumber: 'HD-1',
            remainingAmount: input,
            dueDate: '29/04/2026',
          },
        ]}
      />,
    );

    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('highlights the figures inside each row so they scan like prose', () => {
    const { container } = render(<CopilotReceivableList rows={rows} />);

    const marks = container.querySelectorAll('mark');
    expect(marks.length).toBeGreaterThan(0);
    expect(screen.getByText('13.000.000').tagName).toBe('MARK');
    expect(
      screen.getAllByText('29/04/2026').every((el) => el.tagName === 'MARK'),
    ).toBe(true);
  });

  it('leaves the placeholder for a missing invoice out of the highlight', () => {
    const { container } = render(<CopilotReceivableList rows={rows} />);

    expect(
      [...container.querySelectorAll('mark')].map((el) => el.textContent),
    ).not.toContain('Chưa có số hoá đơn');
  });
});
