export interface ISendReminderEmailInput {
  receivableId: string;
  templateId: string;
  reminderExecutionId: string;
}

export interface IEmailService {
  sendReminderEmail(input: ISendReminderEmailInput): Promise<void>;
}

export const I_EMAIL_SERVICE = Symbol('I_EMAIL_SERVICE');
