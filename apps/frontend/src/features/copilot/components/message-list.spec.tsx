import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MessageList } from './message-list';

describe('MessageList', () => {
  it('shows an accessible animated typing indicator while waiting for a reply', () => {
    const { container } = render(
      <MessageList messages={[]} isWaitingForResponse />,
    );

    expect(screen.getByText('Copilot đang trả lời…')).toHaveClass('sr-only');
    expect(container.querySelectorAll('.animate-bounce')).toHaveLength(3);
    expect(screen.queryByText(/đang xử lý/i)).not.toBeInTheDocument();
  });

  it('leaves the typing dots decorative and announces the wait outside the log', () => {
    render(<MessageList messages={[]} isWaitingForResponse isSending />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Copilot đang trả lời…');
    expect(status).toHaveClass('sr-only');
    // A busy log defers its own announcements, so the status must not sit in it.
    expect(
      screen
        .getByRole('log', { name: 'Cuộc trò chuyện Copilot' })
        .contains(status),
    ).toBe(false);
  });

  it('empties the waiting status once a reply starts streaming', () => {
    const { rerender } = render(
      <MessageList messages={[]} isWaitingForResponse isSending />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Copilot đang trả lời…',
    );

    rerender(
      <MessageList
        messages={[]}
        streamingContent="Đang phân tích"
        isWaitingForResponse
        isSending
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('renders an EmailDraftPreview card for a message carrying a draft', () => {
    render(
      <MessageList
        messages={[
          {
            id: 'message-1',
            role: 'ASSISTANT',
            content: 'Đã tạo bản nháp cho bạn.',
            createdAt: '2026-08-21T10:00:00Z',
            drafts: [
              {
                draftId: 'draft-1',
                receivableId: 'rec-1',
                recipientEmail: 'ap@abc.vn',
                subject: 'Nhắc thanh toán',
                bodyHtml: '<p>Nội dung</p>',
              },
            ],
          },
        ]}
      />,
    );

    expect(screen.getByText('Đã tạo bản nháp cho bạn.')).toBeInTheDocument();
    expect(screen.getByText('Nhắc thanh toán')).toBeInTheDocument();
    expect(screen.getByText('ap@abc.vn')).toBeInTheDocument();
  });

  it('renders no draft card for a message without drafts', () => {
    render(
      <MessageList
        messages={[
          {
            id: 'message-1',
            role: 'ASSISTANT',
            content: 'Chào bạn.',
            createdAt: '2026-08-21T10:00:00Z',
          },
        ]}
      />,
    );

    expect(screen.queryByTitle('Xem trước email')).not.toBeInTheDocument();
  });

  it('exposes the conversation as one polite live log', () => {
    const { rerender } = render(
      <MessageList messages={[]} isSending={false} />,
    );

    const log = screen.getByRole('log', { name: 'Cuộc trò chuyện Copilot' });
    expect(log).toHaveAttribute('aria-live', 'polite');
    expect(log).toHaveAttribute('aria-busy', 'false');

    rerender(<MessageList messages={[]} isSending />);
    expect(log).toHaveAttribute('aria-busy', 'true');
  });

  it('does not nest a second live region inside the log', () => {
    render(<MessageList messages={[]} isWaitingForResponse isSending />);

    const log = screen.getByRole('log', { name: 'Cuộc trò chuyện Copilot' });
    expect(log.querySelectorAll('[aria-live]')).toHaveLength(0);
    expect(log.querySelectorAll('[role="status"]')).toHaveLength(0);
    expect(log.querySelectorAll('[role="img"]')).toHaveLength(0);
    expect(log).not.toHaveTextContent('Copilot đang trả lời…');
  });
});
