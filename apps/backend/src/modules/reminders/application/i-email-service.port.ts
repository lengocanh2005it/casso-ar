export interface ISendReminderEmailInput {
  receivableId: string;
  templateId: string;
  reminderExecutionId: string;
}

export interface IEmailService {
  sendReminderEmail(input: ISendReminderEmailInput): Promise<void>;
  recoverReminderDelivery(
    executionId: string,
  ): Promise<'MISSING' | 'IN_FLIGHT' | 'RETRIED' | 'COMPLETED' | 'EXHAUSTED'>;
}

export const I_EMAIL_SERVICE = Symbol('I_EMAIL_SERVICE');
