import type { CopilotJsonSchema } from '../copilot-tool-registry';

export const SEND_REMINDER_EMAIL_SCHEMA: CopilotJsonSchema = {
  type: 'object',
  properties: {
    draftId: {
      type: 'string',
      description: 'The draftId returned by a prior draftReminderEmail call',
    },
    receivableId: {
      type: 'string',
      description: 'The receivable UUID associated with the draft',
    },
  },
  required: ['draftId', 'receivableId'],
};

export class SendReminderEmailTool {
  static readonly NAME = 'sendReminderEmail';
}
