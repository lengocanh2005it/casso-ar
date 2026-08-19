import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CopilotHistorySidebar } from './copilot-history-sidebar';

const CONVERSATIONS = [
  { id: 'c1', title: 'Hỏi về công nợ ABC', createdAt: '', lastMessageAt: '' },
  {
    id: 'c2',
    title: 'Soạn email nhắc thanh toán',
    createdAt: '',
    lastMessageAt: '',
  },
];

describe('CopilotHistorySidebar', () => {
  it('highlights the active conversation and calls onSelect for another one', () => {
    const onSelect = vi.fn();
    render(
      <CopilotHistorySidebar
        conversations={CONVERSATIONS}
        activeConversationId="c1"
        isLoading={false}
        onSelect={onSelect}
        onNewChat={vi.fn()}
      />,
    );

    expect(screen.getByText('Hỏi về công nợ ABC')).toHaveClass('bg-muted');
    fireEvent.click(screen.getByText('Soạn email nhắc thanh toán'));
    expect(onSelect).toHaveBeenCalledWith('c2');
  });

  it('calls onNewChat from the header button', () => {
    const onNewChat = vi.fn();
    render(
      <CopilotHistorySidebar
        conversations={[]}
        activeConversationId="c1"
        isLoading={false}
        onSelect={vi.fn()}
        onNewChat={onNewChat}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: /cuộc trò chuyện mới/i }),
    );
    expect(onNewChat).toHaveBeenCalled();
  });
});
