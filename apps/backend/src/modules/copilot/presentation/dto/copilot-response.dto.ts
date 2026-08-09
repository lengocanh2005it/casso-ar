import type { CopilotMessageRecord } from '../../application/conversation-repository.port';
import type { CopilotPendingAction } from '../../application/pending-action-repository.port';

export interface CopilotMessageDto {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  createdAt: string;
}

export interface CopilotPendingActionDto {
  id: string;
  actionType: 'SEND_REMINDER_EMAIL';
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED';
  payload: { draftId: string; receivableId: string };
  createdAt: string;
  resolvedAt: string | null;
}

export interface CopilotChatResponseDto {
  message: CopilotMessageDto;
  pendingAction: CopilotPendingActionDto | null;
}

export const toCopilotMessageDto = (
  message: CopilotMessageRecord,
): CopilotMessageDto => ({
  id: message.id,
  role: message.role === 'TOOL' ? 'ASSISTANT' : message.role,
  content: message.content,
  createdAt: message.createdAt.toISOString(),
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
