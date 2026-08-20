import type { EmailAttachment } from '../../../common/email/email-attachment';

export interface EmailSendResult {
  providerMessageId: string;
}

export interface EmailSendOptions {
  text?: string;
  attachments?: EmailAttachment[];
}

export interface IEmailProviderAdapter {
  send(
    to: string,
    subject: string,
    html: string,
    metadata: Record<string, string>,
    replyTo?: string,
    fromName?: string,
    options?: EmailSendOptions,
  ): Promise<EmailSendResult>;
}

export const EMAIL_PROVIDER_ADAPTER = Symbol('EMAIL_PROVIDER_ADAPTER');
