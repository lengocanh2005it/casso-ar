export type CopilotPendingActionStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'EXPIRED';

export interface SendReminderEmailPayload {
  draftId: string;
  receivableId: string;
}

export interface CopilotPendingAction {
  id: string;
  organizationId: string;
  conversationId: string;
  actionType: 'SEND_REMINDER_EMAIL';
  payload: SendReminderEmailPayload;
  status: CopilotPendingActionStatus;
  createdAt: Date;
  resolvedAt: Date | null;
  resolvedByUserId: string | null;
}

export interface ICopilotPendingActionRepository {
  create(
    conversationId: string,
    payload: SendReminderEmailPayload,
  ): Promise<CopilotPendingAction>;
  findById(id: string): Promise<CopilotPendingAction | null>;
  markExpired(id: string): Promise<void>;
  confirmIfPending(
    id: string,
    resolvedByUserId: string,
  ): Promise<CopilotPendingAction | null>;
  cancelIfPending(
    id: string,
    resolvedByUserId: string,
  ): Promise<CopilotPendingAction | null>;
}

export const COPILOT_PENDING_ACTION_REPOSITORY = Symbol(
  'COPILOT_PENDING_ACTION_REPOSITORY',
);
