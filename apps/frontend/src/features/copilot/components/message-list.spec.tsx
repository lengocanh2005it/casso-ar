import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MessageList } from './message-list';

describe('MessageList', () => {
  it('shows an accessible animated typing indicator while waiting for a reply', () => {
    const { container } = render(
      <MessageList messages={[]} isWaitingForResponse />,
    );

    expect(
      screen.getByRole('status', { name: 'Copilot đang trả lời' }),
    ).toBeInTheDocument();
    expect(container.querySelectorAll('.animate-bounce')).toHaveLength(3);
    expect(screen.queryByText(/đang xử lý/i)).not.toBeInTheDocument();
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
});
