export interface CopilotMessageDraft {
  draftId: string;
  receivableId: string;
  recipientEmail: string;
  subject: string;
  bodyHtml: string;
}

export interface CopilotMessage {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  createdAt: string;
  isPartial?: boolean;
  drafts?: CopilotMessageDraft[];
}

export interface CopilotPendingAction {
  id: string;
  actionType: 'SEND_REMINDER_EMAIL';
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED';
  payload: { draftId: string; receivableId: string };
  createdAt: string;
  resolvedAt: string | null;
}

export type CopilotDraftStatus =
  | 'DRAFTED'
  | 'PENDING'
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'EXPIRED';

export interface CopilotDraft {
  id: string;
  receivableId: string;
  recipientEmail: string;
  subject: string;
  bodyHtml: string;
  status: CopilotDraftStatus;
  pendingActionId: string | null;
  createdAt: string;
}

export interface CopilotDraftsPage {
  items: CopilotDraft[];
  total: number;
}

export interface CopilotConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  lastMessageAt: string;
}

export interface CopilotConversationsPage {
  items: CopilotConversationSummary[];
  total: number;
}
