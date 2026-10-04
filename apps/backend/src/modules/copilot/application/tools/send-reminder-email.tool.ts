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

// Proposal-only tool: unlike every other tool here it has no execute() and
// no dependencies, because it only advertises a schema the model must confirm
// before the separate draftReminderEmail tool does any work. A static-only
// class is that shape by design; the constant is read via SendReminderEmailTool.NAME.
// biome-ignore lint/complexity/noStaticOnlyClass: intentional proposal-only tool with no execute()
export class SendReminderEmailTool {
  static readonly NAME = 'sendReminderEmail';
}
