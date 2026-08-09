import {
  SEND_REMINDER_EMAIL_SCHEMA,
  SendReminderEmailTool,
} from './send-reminder-email.tool';

describe('SendReminderEmailTool', () => {
  it('exposes proposal-only metadata with both confirmation payload fields', () => {
    expect(SendReminderEmailTool.NAME).toBe('sendReminderEmail');
    expect(SEND_REMINDER_EMAIL_SCHEMA.required).toEqual([
      'draftId',
      'receivableId',
    ]);
    expect(SEND_REMINDER_EMAIL_SCHEMA.properties).toEqual(
      expect.objectContaining({
        draftId: expect.any(Object),
        receivableId: expect.any(Object),
      }),
    );
    expect('execute' in SendReminderEmailTool.prototype).toBe(false);
  });
});
