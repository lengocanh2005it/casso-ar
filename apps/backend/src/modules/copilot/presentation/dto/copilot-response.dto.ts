import type {
  CopilotConversationSummary,
  CopilotMessageRecord,
} from '../../application/conversation-repository.port';
import type { CopilotDraftListItem } from '../../application/list-copilot-drafts.usecase';
import type { CopilotPendingAction } from '../../application/pending-action-repository.port';
import { DraftReminderEmailTool } from '../../application/tools/draft-reminder-email.tool';

export class CopilotMessageDraftDto {
  draftId: string;
  receivableId: string;
  recipientEmail: string;
  subject: string;
  bodyHtml: string;
}

function isDraftReminderEmailOutput(
  output: unknown,
): output is CopilotMessageDraftDto {
  return (
    typeof output === 'object' &&
    output !== null &&
    'draftId' in output &&
    'receivableId' in output &&
    'recipientEmail' in output &&
    'subject' in output &&
    'bodyHtml' in output
  );
}

export class CopilotMessageDto {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  createdAt: string;
  isPartial: boolean;
  drafts: CopilotMessageDraftDto[];
}

export class CopilotDraftDto {
  id: string;
  receivableId: string;
  recipientEmail: string;
  subject: string;
  bodyHtml: string;
  status: CopilotDraftListItem['status'];
  pendingActionId: string | null;
  createdAt: string;
}

export class CopilotDraftsPageDto {
  items: CopilotDraftDto[];
  total: number;
}

export class CopilotPendingActionDto {
  id: string;
  actionType: 'SEND_REMINDER_EMAIL';
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED';
  payload: { draftId: string; receivableId: string };
  createdAt: string;
  resolvedAt: string | null;
}

export class CopilotChatResponseDto {
  message: CopilotMessageDto;
  pendingAction: CopilotPendingActionDto | null;
}

export class CopilotUsageResponseDto {
  turnsUsed: number;
  turnsLimit: number;
  periodStart: Date;
  periodEnd: Date;
}

export class ReopenCopilotDraftResponseDto {
  conversationId: string;
  pendingAction: CopilotPendingActionDto;
}

export const toCopilotMessageDto = (
  message: CopilotMessageRecord,
): CopilotMessageDto => ({
  id: message.id,
  role: message.role === 'TOOL' ? 'ASSISTANT' : message.role,
  content: message.content,
  createdAt: message.createdAt.toISOString(),
  isPartial: message.isPartial ?? false,
  drafts: (message.toolCalls ?? [])
    .filter((call) => call.name === DraftReminderEmailTool.NAME)
    .map((call) => call.output)
    .filter(isDraftReminderEmailOutput),
});

export const toCopilotPendingActionDto = (
  action: CopilotPendingAction,
): CopilotPendingActionDto => ({
  id: action.id,
  actionType: action.actionType,
  status: action.status,
  payload: action.payload,
  createdAt: action.createdAt.toISOString(),
  resolvedAt: action.resolvedAt?.toISOString() ?? null,
});

export const toCopilotDraftDto = (
  draft: CopilotDraftListItem,
): CopilotDraftDto => ({
  id: draft.id,
  receivableId: draft.receivableId,
  recipientEmail: draft.recipientEmail,
  subject: draft.subject,
  bodyHtml: draft.bodyHtml,
  status: draft.status,
  pendingActionId: draft.pendingActionId,
  createdAt: draft.createdAt.toISOString(),
});

export const toCopilotDraftsPageResponse = (page: {
  items: CopilotDraftListItem[];
  total: number;
}): CopilotDraftsPageDto => ({
  items: page.items.map(toCopilotDraftDto),
  total: page.total,
});

export class CopilotConversationSummaryDto {
  id: string;
  title: string;
  createdAt: string;
  lastMessageAt: string;
}

export class CopilotConversationsPageDto {
  items: CopilotConversationSummaryDto[];
  total: number;
}

export class CopilotConversationMessagesDto {
  items: CopilotMessageDto[];
}

export const toCopilotConversationSummaryDto = (
  summary: CopilotConversationSummary,
): CopilotConversationSummaryDto => ({
  id: summary.id,
  title:
    summary.title?.trim() ||
    `Cuộc trò chuyện ${summary.createdAt.toLocaleDateString('vi-VN')}`,
  createdAt: summary.createdAt.toISOString(),
  lastMessageAt: summary.lastMessageAt.toISOString(),
});

export const toCopilotConversationsPageResponse = (page: {
  items: CopilotConversationSummary[];
  total: number;
}): CopilotConversationsPageDto => ({
  items: page.items.map(toCopilotConversationSummaryDto),
  total: page.total,
});

export const toCopilotConversationMessagesDto = (
  messages: CopilotMessageRecord[],
): CopilotConversationMessagesDto => ({
  items: messages.map(toCopilotMessageDto),
});
