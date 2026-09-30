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
    const { container } = render(
      <CopilotMessageBubble
        message={{ role: 'ASSISTANT', content: 'Đang trả lời' }}
        isStreaming
      />,
    );
    expect(screen.getByText('Đang trả lời')).toHaveClass('bg-muted');
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
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
});
