import type { CopilotMessageRecord } from '../../application/conversation-repository.port';
import { toCopilotMessageDto } from './copilot-response.dto';

function buildMessage(
  overrides: Partial<CopilotMessageRecord> = {},
): CopilotMessageRecord {
  return {
    id: 'message-1',
    organizationId: 'org-1',
    conversationId: 'conversation-1',
    role: 'ASSISTANT',
    content: 'Đã tạo bản nháp.',
    toolCalls: null,
    createdAt: new Date('2026-08-21T10:00:00Z'),
    ...overrides,
  };
}

describe('toCopilotMessageDto', () => {
  it('returns an empty drafts array when there are no tool calls', () => {
    const dto = toCopilotMessageDto(buildMessage());
    expect(dto.drafts).toEqual([]);
  });

  it('surfaces a draftReminderEmail output as a drafts entry', () => {
    const dto = toCopilotMessageDto(
      buildMessage({
        toolCalls: [
          {
            id: 'tool-1',
            name: 'draftReminderEmail',
            input: { receivableId: 'rec-1' },
            output: {
              draftId: 'draft-1',
              receivableId: 'rec-1',
              recipientEmail: 'ap@abc.vn',
              subject: 'Nhắc thanh toán',
              bodyHtml: '<p>Nội dung</p>',
            },
          },
        ],
      }),
    );

    expect(dto.drafts).toEqual([
      {
        draftId: 'draft-1',
        receivableId: 'rec-1',
        recipientEmail: 'ap@abc.vn',
        subject: 'Nhắc thanh toán',
        bodyHtml: '<p>Nội dung</p>',
      },
    ]);
  });

  it('does not surface other tools as drafts', () => {
    const dto = toCopilotMessageDto(
      buildMessage({
        toolCalls: [
          {
            id: 'tool-1',
            name: 'getReceivableSummary',
            input: { customerId: 'cust-1' },
            output: { overdueCount: 2 },
          },
        ],
      }),
    );

    expect(dto.drafts).toEqual([]);
    expect(dto).not.toHaveProperty('toolCalls');
  });

  it('ignores a malformed draftReminderEmail output instead of throwing', () => {
    const dto = toCopilotMessageDto(
      buildMessage({
        toolCalls: [
          {
            id: 'tool-1',
            name: 'draftReminderEmail',
            input: {},
            output: { error: 'something failed' },
          },
        ],
      }),
    );

    expect(dto.drafts).toEqual([]);
  });
});
