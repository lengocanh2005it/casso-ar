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
});
