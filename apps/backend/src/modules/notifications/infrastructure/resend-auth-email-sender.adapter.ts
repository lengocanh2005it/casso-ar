import { Inject, Injectable, Logger } from '@nestjs/common';
import type { IAuthEmailSender } from '../../auth/application/auth-email-sender.port';
import {
  EMAIL_PROVIDER_ADAPTER,
  type IEmailProviderAdapter,
} from '../application/email-provider-adapter.port';

@Injectable()
export class ResendAuthEmailSenderAdapter implements IAuthEmailSender {
  private readonly logger = new Logger(ResendAuthEmailSenderAdapter.name);

  constructor(
    @Inject(EMAIL_PROVIDER_ADAPTER)
    private readonly emailProvider: IEmailProviderAdapter,
  ) {}

  async sendVerificationEmail(to: string, verifyUrl: string): Promise<void> {
    await this.sendSafely(
      to,
      'Verify your email address',
      `<p>Click the following link to verify your email: <a href="${verifyUrl}">${verifyUrl}</a></p>`,
      { emailType: 'AUTH_VERIFICATION' },
    );
  }

  async sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
    await this.sendSafely(
      to,
      'Reset your password',
      `<p>Click the following link to reset your password: <a href="${resetUrl}">${resetUrl}</a></p>`,
      { emailType: 'AUTH_PASSWORD_RESET' },
    );
  }

  async sendInviteEmail(
    to: string,
    acceptUrl: string,
    organizationName: string,
  ): Promise<void> {
    await this.sendSafely(
      to,
      `Invitation to join ${organizationName}`,
      `<p>You are invited to join the organization ${organizationName}. Click the following link to accept: <a href="${acceptUrl}">${acceptUrl}</a></p>`,
      { emailType: 'AUTH_INVITE' },
    );
  }

  // ponytail: swallow send failures so a Resend outage can't turn a
  // successful signup/invite/reset into a 500 after the DB already
  // committed; upgrade to a retryable queue (like the reminder path)
  // if delivery guarantees become a requirement.
  private async sendSafely(
    to: string,
    subject: string,
    html: string,
    metadata: Record<string, string>,
  ): Promise<void> {
    try {
      await this.emailProvider.send(to, subject, html, metadata);
    } catch (error) {
      this.logger.error({
        message: 'Auth email send failed',
        emailType: metadata.emailType,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
