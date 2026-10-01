import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CopilotMessageBubble } from './copilot-message-bubble';

describe('CopilotMessageBubble', () => {
  it('right-aligns a user message without a bot avatar', () => {
    render(
      <CopilotMessageBubble message={{ role: 'USER', content: 'Xin chào' }} />,
    );
    expect(screen.getByText('Xin chào')).toHaveClass('bg-primary');
  });

  it('renders a bot avatar and a blinking cursor while streaming', () => {
    render(
      <CopilotMessageBubble
        message={{ role: 'ASSISTANT', content: 'Đang trả lời' }}
        isStreaming
      />,
    );
    expect(
      screen.getByText('Đang trả lời').closest('.bg-muted'),
    ).not.toBeNull();
    expect(document.querySelector('svg')).toBeInTheDocument();
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('shows a "Đã dừng" marker for a partial assistant message', () => {
    render(
      <CopilotMessageBubble
        message={{ role: 'ASSISTANT', content: 'Đang trả', isPartial: true }}
      />,
    );
    expect(screen.getByText(/đã dừng/i)).toBeInTheDocument();
  });

  it('does not show the marker for a complete assistant message', () => {
    render(
      <CopilotMessageBubble
        message={{ role: 'ASSISTANT', content: 'Xin chào', isPartial: false }}
      />,
    );
    expect(screen.queryByText(/đã dừng/i)).not.toBeInTheDocument();
  });

  it('renders bold Markdown safely in completed assistant messages', () => {
    const content = '**Tổng còn lại**\n<script>alert(1)</script>';
    const { container } = render(
      <CopilotMessageBubble
        message={{ role: 'ASSISTANT', content, isPartial: false }}
      />,
    );

    expect(container.querySelector('strong')).toHaveTextContent('Tổng còn lại');
    expect(container.querySelector('script')).not.toBeInTheDocument();
    expect(container.querySelector('p')?.textContent).toBe(
      'Tổng còn lại\n<script>alert(1)</script>',
    );
  });

  it('renders bold Markdown safely while assistant text is streaming', () => {
    const { container } = render(
      <CopilotMessageBubble
        message={{ role: 'ASSISTANT', content: '**Đang xử lý**' }}
        isStreaming
      />,
    );

    expect(container.querySelector('strong')).toHaveTextContent('Đang xử lý');
    expect(container.querySelector('script')).not.toBeInTheDocument();
  });

  it('keeps Markdown markers literal in user messages', () => {
    render(
      <CopilotMessageBubble
        message={{ role: 'USER', content: '**nguyên văn**' }}
      />,
    );

    expect(screen.getByText('**nguyên văn**')).toBeInTheDocument();
    expect(
      screen.queryByText('nguyên văn', { selector: 'strong' }),
    ).not.toBeInTheDocument();
  });

  it('does not render an empty assistant bubble', () => {
    const { container } = render(
      <CopilotMessageBubble
        message={{ role: 'ASSISTANT', content: '', isPartial: false }}
      />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('wraps a long unbroken assistant value without truncating it', () => {
    const content = `https://example.com/${'transaction-id-'.repeat(12)}`;
    render(
      <CopilotMessageBubble
        message={{ role: 'ASSISTANT', content, isPartial: false }}
      />,
    );

    expect(screen.getByText(content)).toHaveClass('break-words');
    expect(screen.getByText(content)).toHaveTextContent(content);
  });

  it('highlights amounts and due dates in an assistant answer', () => {
    const content =
      'Công ty TNHH Dược phẩm Tâm An còn 13.000.000 VNĐ, đến hạn 29/04/2026.';
    render(
      <CopilotMessageBubble
        message={{ role: 'ASSISTANT', content, isPartial: false }}
      />,
    );

    const amount = screen.getByText('13.000.000 VNĐ');
    expect(amount.tagName).toBe('MARK');
    expect(amount).toHaveClass('text-primary');

    const dueDate = screen.getByText(/29\/04\/2026/);
    expect(dueDate.tagName).toBe('MARK');
    expect(dueDate).toHaveClass('text-primary');
  });

  it('gives a highlighted value its own pill so it never blends into the bubble', () => {
    render(
      <CopilotMessageBubble
        message={{
          role: 'ASSISTANT',
          content: 'Còn 13.000.000 VNĐ.',
          isPartial: false,
        }}
      />,
    );

    expect(screen.getByText('13.000.000 VNĐ')).toHaveClass(
      'bg-primary/15',
      'font-semibold',
      'text-primary',
    );
  });

  it('highlights a customer name in an unformatted list item', () => {
    render(
      <CopilotMessageBubble
        message={{
          role: 'ASSISTANT',
          content: '1. Công ty TNHH Dược phẩm Tâm An: còn 13.000.000 VNĐ',
        }}
      />,
    );

    expect(screen.getByText('Công ty TNHH Dược phẩm Tâm An').tagName).toBe(
      'MARK',
    );
  });

  it('does not highlight an amount inside a user message', () => {
    render(
      <CopilotMessageBubble
        message={{ role: 'USER', content: 'Còn bao nhiêu 13.000.000 VNĐ?' }}
      />,
    );

    expect(document.querySelector('mark')).toBeNull();
  });

  it('leaves ordinary prose untouched when no figure is present', () => {
    const { container } = render(
      <CopilotMessageBubble
        message={{ role: 'ASSISTANT', content: 'Xin chào bạn' }}
      />,
    );

    expect(container.querySelector('mark')).toBeNull();
    expect(container.querySelector('strong')).toBeNull();
  });

  it('renders a numbered receivable list as labelled rows instead of one long line', () => {
    const content = [
      '📋 Dưới đây là danh sách khách hàng đang có công nợ quá hạn:',
      '',
      '1. Công ty TNHH Dược phẩm Tâm An - Số hóa đơn: HD-2026-0037 - Số tiền còn lại: 13.000.000 - Hạn thanh toán: 29/04/2026',
      '2. Hợp tác xã Nông nghiệp Đồng Tâm - Số hóa đơn: Chưa có số hóa đơn - Số tiền còn lại: 19.200.000 - Hạn thanh toán: 29/04/2026',
      '',
      'Có thêm kết quả khác.',
    ].join('\n');

    render(
      <CopilotMessageBubble
        message={{ role: 'ASSISTANT', content, isPartial: false }}
      />,
    );

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('HD-2026-0037');
    expect(items[1]).toHaveTextContent('Chưa có số hoá đơn');
    expect(
      screen.getByText(/Dưới đây là danh sách khách hàng/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Có thêm kết quả khác/)).toBeInTheDocument();
  });

  it('keeps a row readable when the due date is missing', () => {
    const content =
      '1. Công ty TNHH Bao bì Tân Tiến - Số hóa đơn: HD-2026-0033 - Số tiền còn lại: 8.500.000';

    render(
      <CopilotMessageBubble
        message={{ role: 'ASSISTANT', content, isPartial: false }}
      />,
    );

    const item = screen.getByRole('listitem');
    expect(item).toHaveTextContent('8.500.000');
    expect(item).not.toHaveTextContent('null');
    expect(item).not.toHaveTextContent('undefined');
  });

  it('falls back to plain text for a numbered line that is not a receivable row', () => {
    const content = '1. Bước đầu tiên là kiểm tra hồ sơ.';

    render(
      <CopilotMessageBubble
        message={{ role: 'ASSISTANT', content, isPartial: false }}
      />,
    );

    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
    expect(screen.getByText(content)).toBeInTheDocument();
  });

  it('does not build a receivable list while the answer is still streaming', () => {
    const content =
      '1. Công ty TNHH Dược phẩm Tâm An - Số hóa đơn: HD-2026-0037 - Số tiền còn lại: 13.000.000 - Hạn thanh toán: 29/04/2026';

    const { container } = render(
      <CopilotMessageBubble
        message={{ role: 'ASSISTANT', content }}
        isStreaming
      />,
    );

    expect(container.querySelector('ul')).toBeNull();
    expect(container.querySelector('p')?.textContent).toBe(content);
  });

  it('normalises a row whose name or figures arrive with stray Markdown or punctuation', () => {
    const content =
      '1. **Công ty A** - Số hóa đơn: HD-1 - Số tiền còn lại: 1.000.000. - Hạn thanh toán: 2026-04-29';

    render(
      <CopilotMessageBubble
        message={{ role: 'ASSISTANT', content, isPartial: false }}
      />,
    );

    const item = screen.getByRole('listitem');
    expect(item).toHaveTextContent('Công ty A');
    expect(item).not.toHaveTextContent('**');
    expect(item).toHaveTextContent('1.000.000');
    expect(item).not.toHaveTextContent('1.000.000.');
    expect(item).toHaveTextContent('2026-04-29');
  });

  it('treats a zero remaining amount as a real row', () => {
    const content =
      '1. Công ty A - Số hóa đơn: HD-1 - Số tiền còn lại: 0 - Hạn thanh toán: 01/01/2027';

    render(
      <CopilotMessageBubble
        message={{ role: 'ASSISTANT', content, isPartial: false }}
      />,
    );

    expect(screen.getByRole('listitem')).toHaveTextContent('0');
  });

  it('leaves a bullet line as prose instead of dropping it', () => {
    const content =
      '- Công ty A - Số hóa đơn: HD-1 - Số tiền còn lại: 1.000.000';

    const { container } = render(
      <CopilotMessageBubble
        message={{ role: 'ASSISTANT', content, isPartial: false }}
      />,
    );

    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
    expect(container.textContent).toContain(content);
  });

  it('reads a row whose labels the model phrased differently', () => {
    const content = [
      '1. Công ty TNHH Dược phẩm Tâm An - Số hóa đơn: HD-2026-0037 - Số tiền còn lại: 13,000,000 VNĐ - Ngày đáo hạn: 29/04/2026',
      '2. Hợp tác xã Nông nghiệp Đồng Tâm - Số hóa đơn: HD-2026-0047 - Số tiền còn lại: 19,200,000 VNĐ - Hạn thanh toán: 29/04/2026',
    ].join('\n');

    render(
      <CopilotMessageBubble
        message={{ role: 'ASSISTANT', content, isPartial: false }}
      />,
    );

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('29/04/2026');
    expect(items[0]).toHaveTextContent('13,000,000');
    expect(items[0]).not.toHaveTextContent('VNĐ');
    expect(items[1]).toHaveTextContent('HD-2026-0047');
  });

  it('joins a receivable the model split across several lines into one row', () => {
    const content = [
      '1. Công ty TNHH Dược phẩm Tâm An',
      'Số hóa đơn: HD-2026-0037',
      'Số tiền còn lại: 13,000,000 VNĐ',
      'Ngày đáo hạn: 29/04/2026',
      '',
      '2. Hợp tác xã Nông nghiệp Đồng Tâm',
      'Số hóa đơn: HD-2026-0047',
      'Số tiền còn lại: 19,200,000 VNĐ',
      'Hạn thanh toán: 29/04/2026',
    ].join('\n');

    render(
      <CopilotMessageBubble
        message={{ role: 'ASSISTANT', content, isPartial: false }}
      />,
    );

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Công ty TNHH Dược phẩm Tâm An');
    expect(items[0]).toHaveTextContent('HD-2026-0037');
    expect(items[0]).toHaveTextContent('13,000,000');
    expect(items[0]).toHaveTextContent('29/04/2026');
    expect(items[1]).toHaveTextContent('Hợp tác xã Nông nghiệp Đồng Tâm');
  });
});
