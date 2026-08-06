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
    this.client = new Resend(process.env.RESEND_API_KEY ?? '');
    this.fromAddress =
      process.env.RESEND_FROM_ADDRESS ?? 'no-reply@casso-ledger.vn';
  }

  async send(
    to: string,
    subject: string,
    html: string,
    metadata: Record<string, string>,
    replyTo?: string,
  ): Promise<EmailSendResult> {
    const result = await this.client.emails.send({
      from: this.fromAddress,
      to,
      subject,
      html,
      tags: Object.entries(metadata).map(([name, value]) => ({ name, value })),
      ...(replyTo ? { reply_to: replyTo } : {}),
    });

    if (result.error || !result.data?.id) {
      throw new Error(
        `Resend send failed: ${result.error?.message ?? 'unknown error'}`,
      );
    }

    return { providerMessageId: result.data.id };
  }
}
