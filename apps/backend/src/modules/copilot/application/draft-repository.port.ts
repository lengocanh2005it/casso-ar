export interface CopilotDraft {
  id: string;
  organizationId: string;
  userId: string | null;
  receivableId: string;
  recipientEmail: string;
  subject: string;
  bodyHtml: string;
  createdAt: Date;
}

export interface ICopilotDraftRepository {
  save(draft: CopilotDraft): Promise<void>;
  findById(id: string): Promise<CopilotDraft | null>;
  findAllForUser(userId: string): Promise<CopilotDraft[]>;
  delete(id: string): Promise<void>;
}

export const COPILOT_DRAFT_REPOSITORY = Symbol('COPILOT_DRAFT_REPOSITORY');
