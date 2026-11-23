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

  it('falls back to a named conversation when the title is empty', () => {
    render(
      <CopilotHistorySidebar
        conversations={[
          { id: 'c1', title: '', createdAt: '', lastMessageAt: '' },
        ]}
        activeConversationId="c1"
        isLoading={false}
        onSelect={vi.fn()}
        onNewChat={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Cuộc trò chuyện không tên' }),
    ).toBeInTheDocument();
  });

  it('marks the active conversation with aria-current', () => {
    render(
      <CopilotHistorySidebar
        conversations={CONVERSATIONS}
        activeConversationId="c1"
        isLoading={false}
        onSelect={vi.fn()}
        onNewChat={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Hỏi về công nợ ABC' }),
    ).toHaveAttribute('aria-current', 'true');
    expect(
      screen.getByRole('button', { name: 'Soạn email nhắc thanh toán' }),
    ).not.toHaveAttribute('aria-current');
  });

  it('gives conversation buttons a visible focus ring', () => {
    render(
      <CopilotHistorySidebar
        conversations={CONVERSATIONS}
        activeConversationId="c1"
        isLoading={false}
        onSelect={vi.fn()}
        onNewChat={vi.fn()}
      />,
    );

    const button = screen.getByRole('button', { name: 'Hỏi về công nợ ABC' });
    expect(button).toHaveClass('focus-visible:outline-none');
    expect(button).toHaveClass('focus-visible:ring-2');
    expect(button).toHaveClass('focus-visible:ring-ring');
  });

  it('announces the loading state', () => {
    render(
      <CopilotHistorySidebar
        conversations={[]}
        activeConversationId="c1"
        isLoading
        onSelect={vi.fn()}
        onNewChat={vi.fn()}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Đang tải…');
  });

  it('offers a load-more button only while more conversations remain', () => {
    const onLoadMore = vi.fn();
    const { rerender } = render(
      <CopilotHistorySidebar
        conversations={CONVERSATIONS}
        activeConversationId="c1"
        isLoading={false}
        onSelect={vi.fn()}
        onNewChat={vi.fn()}
        hasMore
        onLoadMore={onLoadMore}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Xem thêm' }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);

    rerender(
      <CopilotHistorySidebar
        conversations={CONVERSATIONS}
        activeConversationId="c1"
        isLoading={false}
        onSelect={vi.fn()}
        onNewChat={vi.fn()}
        hasMore={false}
        onLoadMore={onLoadMore}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Xem thêm' })).toBeNull();
  });

  it('shows the load-more button as busy while the next page loads', () => {
    render(
      <CopilotHistorySidebar
        conversations={CONVERSATIONS}
        activeConversationId="c1"
        isLoading={false}
        onSelect={vi.fn()}
        onNewChat={vi.fn()}
        hasMore
        isLoadingMore
        onLoadMore={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Xem thêm' })).toBeDisabled();
  });

  it('hides the header icons from assistive technology', () => {
    render(
      <CopilotHistorySidebar
        conversations={[]}
        activeConversationId="c1"
        isLoading={false}
        onSelect={vi.fn()}
        onNewChat={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    for (const button of screen.getAllByRole('button')) {
      for (const svg of button.querySelectorAll('svg')) {
        expect(svg).toHaveAttribute('aria-hidden', 'true');
      }
    }
  });
});
