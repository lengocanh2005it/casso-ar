import { Injectable } from '@nestjs/common';
import { Resend } from 'resend';
import type {
  EmailSendResult,
  IEmailProviderAdapter,
} from '../application/email-provider-adapter.port';

@Injectable()
export class ResendEmailAdapter implements IEmailProviderAdapter {
  private readonly client: Resend;
  private readonly fromAddress: string;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY ?? 're_missing_key';
    this.client = new Resend(apiKey);
    this.fromAddress =
      process.env.RESEND_FROM_ADDRESS ?? 'no-reply@casso-ledger.vn';
  }

  async send(
    to: string,
    subject: string,
    html: string,
    metadata: Record<string, string>,
    replyTo?: string,
    fromName?: string,
  ): Promise<EmailSendResult> {
    const from = fromName
      ? `"${fromName.replaceAll('"', "'")}" <${this.fromAddress}>`
      : this.fromAddress;
    const result = await this.client.emails.send({
      from,
      to,
      subject,
      html,
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
