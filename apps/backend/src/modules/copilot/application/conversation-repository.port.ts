import type { EntityManager } from 'typeorm';

export type CopilotMessageRole = 'USER' | 'ASSISTANT' | 'TOOL';

export interface CopilotConversation {
  id: string;
  organizationId: string;
  userId: string;
  customerId: string | null;
  createdAt: Date;
}

export interface CopilotMessageRecord {
  id: string;
  organizationId: string;
  conversationId: string;
  role: CopilotMessageRole;
  content: string;
  toolCalls: Array<{ id: string; name: string; input: unknown }> | null;
  createdAt: Date;
}

export interface ICopilotConversationRepository {
  findOrCreate(
    conversationId: string,
    userId: string,
  ): Promise<CopilotConversation>;
  listMessages(conversationId: string): Promise<CopilotMessageRecord[]>;
  appendMessage(
    message: Omit<CopilotMessageRecord, 'id' | 'organizationId'>,
    manager?: EntityManager,
  ): Promise<CopilotMessageRecord>;
}

export const COPILOT_CONVERSATION_REPOSITORY = Symbol(
  'COPILOT_CONVERSATION_REPOSITORY',
);
