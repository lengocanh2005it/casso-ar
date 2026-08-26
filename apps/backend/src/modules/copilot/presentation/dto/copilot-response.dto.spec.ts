import type { CopilotMessageRecord } from '../../application/conversation-repository.port';
import type { CopilotPendingAction } from '../../application/pending-action-repository.port';
import {
  toCopilotMessageDto,
  toCopilotPendingActionDto,
} from './copilot-response.dto';

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

describe('toCopilotPendingActionDto', () => {
  const action = (
    payload: CopilotPendingAction['payload'],
  ): CopilotPendingAction => ({
    id: 'action-1',
    organizationId: 'org-1',
    conversationId: 'conversation-1',
    actionType: 'SEND_REMINDER_EMAIL',
    payload,
    status: 'PENDING',
    createdAt: new Date('2026-08-21T10:00:00Z'),
    resolvedAt: null,
    resolvedByUserId: null,
  });

  it('builds a human receivable label from persisted metadata', () => {
    expect(
      toCopilotPendingActionDto(
        action({
          draftId: 'draft-1',
          receivableId: 'receivable-1',
          customerName: 'Công ty An Phát',
          invoiceNumber: 'INV-2026-001',
        }),
      ),
    ).toMatchObject({
      receivableLabel: 'INV-2026-001 — Công ty An Phát',
      payload: { draftId: 'draft-1', receivableId: 'receivable-1' },
    });
  });

  it('returns a null receivable label when no presentation metadata exists', () => {
    expect(
      toCopilotPendingActionDto(
        action({ draftId: 'draft-1', receivableId: 'receivable-1' }),
      ).receivableLabel,
    ).toBeNull();
  });
});
