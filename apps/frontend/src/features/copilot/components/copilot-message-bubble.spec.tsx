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
