import { ReceivableStatus } from '@casso-ar/shared-types';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ReceivableBalanceHistoryTable } from './receivable-balance-history-table';

describe('ReceivableBalanceHistoryTable', () => {
  it('uses Vietnamese fallbacks instead of raw internal codes or IDs', () => {
    render(
      <MemoryRouter>
        <ReceivableBalanceHistoryTable
          items={[
            {
              id: 'history-1',
              sequence: 1,
              receivableId: '77b1de38-2ace-4b6d-b6b3-cf81d70b1024',
              invoiceNumber: null,
              customerId: 'customer-1',
              customerName: null,
              status: ReceivableStatus.OPEN,
              remainingAmount: '9007199254740993',
              effectiveAt: '2026-08-26T01:00:00.000Z',
              changeSource: 'ROLLOUT_BASELINE',
              reasonCode: 'ROLLOUT_BASELINE',
              actorType: null,
              actorUserId: null,
              actorDisplayName: null,
              transitionReferenceId: null,
              note: null,
            },
          ]}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('Khoản phải thu')).toBeInTheDocument();
    expect(screen.getByText('Chưa có tên khách hàng')).toBeInTheDocument();
    expect(screen.getByText('Dữ liệu khởi tạo')).toBeInTheDocument();
    expect(screen.getByText('9.007.199.254.740.993 ₫')).toBeInTheDocument();
    // Same wording and colour as the receivables list (was "Mở").
    expect(screen.getByText('Đang thu')).toHaveClass('text-info');
  });

  it('stacks the seven-column row into a card on a phone', () => {
    render(
      <MemoryRouter>
        <ReceivableBalanceHistoryTable
          items={[
            {
              id: 'history-1',
              sequence: 1,
              receivableId: '77b1de38-2ace-4b6d-b6b3-cf81d70b1024',
              invoiceNumber: 'HD-2026-0046',
              customerId: 'customer-1',
              customerName: 'Công ty TNHH Thương mại Dịch vụ Hoàng Gia',
              status: ReceivableStatus.OPEN,
              remainingAmount: '16500000',
              effectiveAt: '2026-08-26T01:00:00.000Z',
              changeSource: 'CREATE',
              reasonCode: 'RECEIVABLE_CREATED',
              actorType: 'USER',
              actorUserId: 'user-1',
              actorDisplayName: 'Nguyễn Minh Anh',
              transitionReferenceId: null,
              note: null,
            },
          ]}
        />
      </MemoryRouter>,
    );

    // Measured at 390px: the table ran ~700px wider than its 291px scroller.
    // Below md the row is a card so the timestamp, invoice, customer,
    // status, balance and actor all stay readable without a sideways swipe.
    const rows = screen.getAllByRole('row');
    expect(rows[0].closest('thead')).toHaveClass('max-md:hidden');
    expect(rows[1]).toHaveClass('max-md:grid');

    // Customer is the card's title and spans the full width.
    const customerCell = screen
      .getByText('Công ty TNHH Thương mại Dịch vụ Hoàng Gia')
      .closest('td');
    expect(customerCell?.className).toContain('max-md:col-span-2');

    // The balance is the number a reviewer scans for, so it keeps the
    // right edge on the card's title row instead of dropping to a second row.
    const balanceCell = screen.getByText(/16\.500\.000/).closest('td');
    expect(balanceCell?.className).toContain('max-md:col-start-2');
    expect(balanceCell?.className).toContain('max-md:text-right');
  });

  it('lets long customer and source names wrap on a card instead of truncating', () => {
    render(
      <MemoryRouter>
        <ReceivableBalanceHistoryTable
          items={[
            {
              id: 'history-1',
              sequence: 1,
              receivableId: '77b1de38-2ace-4b6d-b6b3-cf81d70b1024',
              invoiceNumber: 'HD-2026-0046',
              customerId: 'customer-1',
              customerName: 'Công ty TNHH Thương mại Dịch vụ Hoàng Gia',
              status: ReceivableStatus.OPEN,
              remainingAmount: '16500000',
              effectiveAt: '2026-08-26T01:00:00.000Z',
              changeSource: 'CREATE',
              reasonCode: 'RECEIVABLE_CREATED',
              actorType: 'USER',
              actorUserId: 'user-1',
              actorDisplayName: 'Nguyễn Minh Anh',
              transitionReferenceId: null,
              note: null,
            },
          ]}
        />
      </MemoryRouter>,
    );

    // `truncate` exists to protect a table cell from spilling into the next
    // column. On a card the cell already owns the full width, so the same
    // class clips "Hợp tác xã Nông nghiệp Đồng Tâm" to "…Đ..." with two
    // whole words hidden and no way to read them. The card has room to wrap.
    const customerName = screen.getByText(
      'Công ty TNHH Thương mại Dịch vụ Hoàng Gia',
    );
    // The clipping classes now sit on the cell's own span while the name
    // lives inside TruncatedText's span, so read them off the wrapper.
    const nameWrapper = customerName.closest('span');
    expect(nameWrapper?.className).toContain('max-md:whitespace-normal');
    // `truncate` stays for desktop (the cell really does sit next to other
    // columns there) and is overridden by the max-md:* classes above md.
    expect(nameWrapper?.className).toContain('max-md:max-w-none');

    // Same for the "source • actor" line, which was clipped mid-name.
    const source = screen.getByText(/Tạo mới/);
    expect(source.closest('div')?.className).toContain(
      'max-md:whitespace-normal',
    );
  });

  it('drops the redundant Chi tiết label on a card so the label is not repeated', () => {
    render(
      <MemoryRouter>
        <ReceivableBalanceHistoryTable
          items={[
            {
              id: 'history-1',
              sequence: 1,
              receivableId: '77b1de38-2ace-4b6d-b6b3-cf81d70b1024',
              invoiceNumber: 'HD-2026-0046',
              customerId: 'customer-1',
              customerName: 'Công ty TNHH ABC',
              status: ReceivableStatus.OPEN,
              remainingAmount: '16500000',
              effectiveAt: '2026-08-26T01:00:00.000Z',
              changeSource: 'CREATE',
              reasonCode: 'RECEIVABLE_CREATED',
              actorType: 'USER',
              actorUserId: 'user-1',
              actorDisplayName: 'Nguyễn Minh Anh',
              transitionReferenceId: null,
              note: null,
            },
          ]}
        />
      </MemoryRouter>,
    );

    // The button already says "Chi tiết". Adding a "Chi tiết" field label
    // above it rendered the word twice on its own row. The <thead> still
    // holds one, but it is `sr-only` and hidden below md, so only the button
    // is a visible match.
    const visible = screen
      .getAllByText('Chi tiết')
      .filter(
        (el) => !el.closest('.sr-only') && !el.classList.contains('sr-only'),
      );
    expect(visible).toHaveLength(1);
  });

  it('gives the card breathing room and a real title instead of seven stacked labels', () => {
    render(
      <MemoryRouter>
        <ReceivableBalanceHistoryTable
          items={[
            {
              id: 'history-1',
              sequence: 1,
              receivableId: '77b1de38-2ace-4b6d-b6b3-cf81d70b1024',
              invoiceNumber: 'HD-2026-0046',
              customerId: 'customer-1',
              customerName: 'Công ty TNHH Thương mại Dịch vụ Hoàng Gia',
              status: ReceivableStatus.OPEN,
              remainingAmount: '16500000',
              effectiveAt: '2026-08-26T01:00:00.000Z',
              changeSource: 'CREATE',
              reasonCode: 'RECEIVABLE_CREATED',
              actorType: 'USER',
              actorUserId: 'user-1',
              actorDisplayName: 'Nguyễn Minh Anh',
              transitionReferenceId: null,
              note: null,
            },
          ]}
        />
      </MemoryRouter>,
    );

    // A label on every one of the seven fields stacked into a 309px card
    // with only 8px between rows, so each label sat right on top of the
    // value above it. The card now gives each field real vertical air and
    // promotes the timestamp + balance to an unlabelled title line, the way
    // /exceptions and /customers do.
    const row = screen.getAllByRole('row')[1];
    expect(row.className).toContain('max-md:gap-y-3');
    expect(row.className).toContain('max-md:py-4');

    // Only the genuinely secondary fields carry a mobile label now. The
    // <th> text is scoped out — the labels live in `md:hidden` spans.
    const mobileLabels = [...document.querySelectorAll('.md\\:hidden')].map(
      (el) => (el.textContent || '').trim(),
    );
    expect(mobileLabels).toEqual([
      'Mã hóa đơn',
      'Khách hàng',
      'Trạng thái',
      'Nguồn / Tác nhân',
    ]);

    // "Thời điểm" and "Số dư còn lại" are the card's title line — labelling
    // them just repeats what the position and the bold weight already say.
    expect(mobileLabels).not.toContain('Thời điểm');
    expect(mobileLabels).not.toContain('Số dư còn lại');
  });
});
