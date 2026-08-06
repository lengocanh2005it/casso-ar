export interface EmailSendResult {
  providerMessageId: string;
}

export interface IEmailProviderAdapter {
  send(
    to: string,
    subject: string,
    html: string,
    metadata: Record<string, string>,
    replyTo?: string,
  ): Promise<EmailSendResult>;
}

export const EMAIL_PROVIDER_ADAPTER = Symbol('EMAIL_PROVIDER_ADAPTER');
