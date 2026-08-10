export interface CopilotMessage {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  createdAt: string;
}

export interface CopilotPendingAction {
  id: string;
  actionType: 'SEND_REMINDER_EMAIL';
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED';
  payload: { draftId: string; receivableId: string };
  createdAt: string;
  resolvedAt: string | null;
}
