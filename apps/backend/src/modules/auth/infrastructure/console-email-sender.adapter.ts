import { Injectable, Logger } from '@nestjs/common';
import type { IAuthEmailSender } from '../application/auth-email-sender.port';

@Injectable()
export class ConsoleEmailSenderAdapter implements IAuthEmailSender {
  private readonly logger = new Logger(ConsoleEmailSenderAdapter.name);

  async sendVerificationEmail(to: string, verifyUrl: string): Promise<void> {
    this.logger.log({
      message: 'Verification email queued (stub)',
      to,
      verifyUrl,
    });
  }

  async sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
    this.logger.log({
      message: 'Password reset email queued (stub)',
      to,
      resetUrl,
    });
  }

  async sendInviteEmail(
    to: string,
    acceptUrl: string,
    organizationName: string,
  ): Promise<void> {
    this.logger.log({
      message: 'Invite email queued (stub)',
      to,
      acceptUrl,
      organizationName,
    });
  }
}
