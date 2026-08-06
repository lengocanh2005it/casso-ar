import { Inject, Injectable } from '@nestjs/common';
import type { IAuthEmailSender } from '../../auth/application/auth-email-sender.port';
import {
  EMAIL_PROVIDER_ADAPTER,
  type IEmailProviderAdapter,
} from '../application/email-provider-adapter.port';

@Injectable()
export class ResendAuthEmailSenderAdapter implements IAuthEmailSender {
  constructor(
    @Inject(EMAIL_PROVIDER_ADAPTER)
    private readonly emailProvider: IEmailProviderAdapter,
  ) {}

  async sendVerificationEmail(to: string, verifyUrl: string): Promise<void> {
    await this.emailProvider.send(
      to,
      'Verify your email address',
      `<p>Click the following link to verify your email: <a href="${verifyUrl}">${verifyUrl}</a></p>`,
      { emailType: 'AUTH_VERIFICATION' },
    );
  }

  async sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
    await this.emailProvider.send(
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
    await this.emailProvider.send(
      to,
      `Invitation to join ${organizationName}`,
      `<p>You are invited to join the organization ${organizationName}. Click the following link to accept: <a href="${acceptUrl}">${acceptUrl}</a></p>`,
      { emailType: 'AUTH_INVITE' },
    );
  }
}
