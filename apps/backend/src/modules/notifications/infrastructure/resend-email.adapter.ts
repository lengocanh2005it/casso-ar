import { Injectable } from '@nestjs/common';
import { Resend } from 'resend';
import type {
  EmailSendOptions,
  EmailSendResult,
  IEmailProviderAdapter,
} from '../application/email-provider-adapter.port';

// RFC 5322 quoted-string hygiene for an org-controlled display name: strip
// CR/LF (header injection) and escape backslash + double-quote so the name
// cannot break out of the From header.
function sanitizeDisplayName(name: string): string {
  return name
    .replace(/[\r\n]+/g, ' ')
    .replaceAll('\\', '\\\\')
    .replaceAll('"', "'");
}

@Injectable()
export class ResendEmailAdapter implements IEmailProviderAdapter {
  private readonly client: Resend;
  private readonly fromAddress: string;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY ?? '';
    if (apiKey.trim() === '') {
      throw new Error('RESEND_API_KEY must be set and non-empty');
    }
    this.client = new Resend(apiKey);
    this.fromAddress =
      process.env.RESEND_FROM_ADDRESS ?? 'no-reply@casso-ar.vn';
  }
  async send(
    to: string,
    subject: string,
    html: string,
    metadata: Record<string, string>,
    replyTo?: string,
    fromName?: string,
    options?: EmailSendOptions,
  ): Promise<EmailSendResult> {
    const from = fromName
      ? `"${sanitizeDisplayName(fromName)}" <${this.fromAddress}>`
      : this.fromAddress;
    const attachments = options?.attachments?.map(
      ({ content, filename, contentId }) => ({
        content,
        filename,
        ...(contentId ? { contentId } : {}),
      }),
    );
    const result = await this.client.emails.send({
      from,
      to,
      subject,
      html,
      ...(options?.text !== undefined ? { text: options.text } : {}),
      ...(attachments?.length ? { attachments } : {}),
      tags: Object.entries(metadata).map(([name, value]) => ({ name, value })),
      ...(replyTo ? { replyTo } : {}),
    });

    if (result.error || !result.data?.id) {
      throw new Error(
        `Resend send failed: ${result.error?.message ?? 'unknown error'}`,
      );
    }

    return { providerMessageId: result.data.id };
  }
}
