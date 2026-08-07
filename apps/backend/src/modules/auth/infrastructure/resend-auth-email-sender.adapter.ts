import { Inject, Injectable } from '@nestjs/common';
import {
  EMAIL_QUEUE_PORT,
  type IEmailQueue,
} from '../../notifications/application/email-queue.port';
import type { IAuthEmailSender } from '../application/auth-email-sender.port';

@Injectable()
export class ResendAuthEmailSenderAdapter implements IAuthEmailSender {
  constructor(
    @Inject(EMAIL_QUEUE_PORT) private readonly emailQueue: IEmailQueue,
  ) {}

  async sendVerificationEmail(to: string, verifyUrl: string): Promise<void> {
    await this.emailQueue.add('send-auth-email', {
      to,
      subject: 'Verify your email address',
      html: `<p>Click the following link to verify your email: <a href="${verifyUrl}">${verifyUrl}</a></p>`,
      emailType: 'AUTH_VERIFICATION',
    });
  }

  async sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
    await this.emailQueue.add('send-auth-email', {
      to,
      subject: 'Reset your password',
      html: `<p>Click the following link to reset your password: <a href="${resetUrl}">${resetUrl}</a></p>`,
      emailType: 'AUTH_PASSWORD_RESET',
    });
  }

  async sendInviteEmail(
    to: string,
    acceptUrl: string,
    organizationName: string,
  ): Promise<void> {
    await this.emailQueue.add('send-auth-email', {
      to,
      subject: `Invitation to join ${organizationName}`,
      html: `<p>You are invited to join the organization ${organizationName}. Click the following link to accept: <a href="${acceptUrl}">${acceptUrl}</a></p>`,
      emailType: 'AUTH_INVITE',
    });
  }
}
