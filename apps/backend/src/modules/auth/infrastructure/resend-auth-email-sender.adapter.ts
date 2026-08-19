import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  EMAIL_QUEUE_PORT,
  type IEmailQueue,
} from '../../notifications/application/email-queue.port';
import type { IAuthEmailSender } from '../application/auth-email-sender.port';
import type { IMemberNotificationSender } from '../application/member-notification.port';

@Injectable()
export class ResendAuthEmailSenderAdapter
  implements IAuthEmailSender, IMemberNotificationSender
{
  private readonly logger = new Logger(ResendAuthEmailSenderAdapter.name);

  constructor(
    @Inject(EMAIL_QUEUE_PORT) private readonly emailQueue: IEmailQueue,
  ) {}

  async sendVerificationEmail(to: string, verifyUrl: string): Promise<void> {
    try {
      await this.emailQueue.add('send-auth-email', {
        to,
        subject: 'Verify your email address',
        html: `<p>Click the following link to verify your email: <a href="${verifyUrl}">${verifyUrl}</a></p>`,
        emailType: 'AUTH_VERIFICATION',
      });
    } catch (error) {
      this.logger.error('Failed to enqueue verification email', {
        to,
        error: error instanceof Error ? error.message : String(error),
      });
      throw AppError.withCause(
        error,
        ErrorCode.EMAIL_SEND_FAILED,
        'Không thể gửi email xác thực. Vui lòng thử lại sau.',
      );
    }
  }

  async sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
    try {
      await this.emailQueue.add('send-auth-email', {
        to,
        subject: 'Reset your password',
        html: `<p>Click the following link to reset your password: <a href="${resetUrl}">${resetUrl}</a></p>`,
        emailType: 'AUTH_PASSWORD_RESET',
      });
    } catch (error) {
      this.logger.error('Failed to enqueue password reset email', {
        to,
        error: error instanceof Error ? error.message : String(error),
      });
      throw AppError.withCause(
        error,
        ErrorCode.EMAIL_SEND_FAILED,
        'Không thể gửi email đặt lại mật khẩu. Vui lòng thử lại sau.',
      );
    }
  }

  async sendInviteEmail(
    to: string,
    acceptUrl: string,
    organizationName: string,
  ): Promise<void> {
    try {
      await this.emailQueue.add('send-auth-email', {
        to,
        subject: `Invitation to join ${organizationName}`,
        html: `<p>You are invited to join the organization ${organizationName}. Click the following link to accept: <a href="${acceptUrl}">${acceptUrl}</a></p>`,
        emailType: 'AUTH_INVITE',
      });
    } catch (error) {
      this.logger.error('Failed to enqueue invite email', {
        to,
        organizationName,
        error: error instanceof Error ? error.message : String(error),
      });
      throw AppError.withCause(
        error,
        ErrorCode.EMAIL_SEND_FAILED,
        'Không thể gửi email mời. Vui lòng thử lại sau.',
      );
    }
  }

  async sendMemberBlockedEmail(
    to: string,
    organizationName: string,
  ): Promise<void> {
    try {
      await this.emailQueue.add('send-auth-email', {
        to,
        subject: `Quyền truy cập của bạn vào ${organizationName} đã bị chặn`,
        html: `<p>Quyền truy cập của bạn vào tổ chức ${organizationName} trên Casso đã bị chặn. Liên hệ quản trị viên của tổ chức nếu bạn cho rằng đây là nhầm lẫn.</p>`,
        emailType: 'MEMBER_BLOCKED',
      });
    } catch (error) {
      this.logger.error('Failed to enqueue member blocked email', {
        to,
        organizationName,
        error: error instanceof Error ? error.message : String(error),
      });
      throw AppError.withCause(
        error,
        ErrorCode.EMAIL_SEND_FAILED,
        'Không thể gửi email thông báo chặn thành viên.',
      );
    }
  }

  async sendMemberUnblockedEmail(
    to: string,
    organizationName: string,
  ): Promise<void> {
    try {
      await this.emailQueue.add('send-auth-email', {
        to,
        subject: `Quyền truy cập của bạn vào ${organizationName} đã được khôi phục`,
        html: `<p>Quyền truy cập của bạn vào tổ chức ${organizationName} trên Casso đã được khôi phục.</p>`,
        emailType: 'MEMBER_UNBLOCKED',
      });
    } catch (error) {
      this.logger.error('Failed to enqueue member unblocked email', {
        to,
        organizationName,
        error: error instanceof Error ? error.message : String(error),
      });
      throw AppError.withCause(
        error,
        ErrorCode.EMAIL_SEND_FAILED,
        'Không thể gửi email thông báo khôi phục thành viên.',
      );
    }
  }

  async sendOrganizationApprovedEmail(
    to: string,
    organizationName: string,
  ): Promise<void> {
    try {
      await this.emailQueue.add('send-auth-email', {
        to,
        subject: `Tổ chức ${organizationName} đã được duyệt`,
        html: `<p>Tổ chức ${organizationName} của bạn trên Casso đã được duyệt. Bạn có thể đăng nhập để sử dụng dịch vụ.</p>`,
        emailType: 'ORGANIZATION_APPROVED',
      });
    } catch (error) {
      this.logger.error('Failed to enqueue organization approved email', {
        to,
        organizationName,
        error: error instanceof Error ? error.message : String(error),
      });
      throw AppError.withCause(
        error,
        ErrorCode.EMAIL_SEND_FAILED,
        'Không thể gửi email thông báo duyệt tổ chức.',
      );
    }
  }

  async sendOrganizationRejectedEmail(
    to: string,
    organizationName: string,
  ): Promise<void> {
    try {
      await this.emailQueue.add('send-auth-email', {
        to,
        subject: `Đăng ký tổ chức ${organizationName} chưa được chấp thuận`,
        html: `<p>Đăng ký tổ chức ${organizationName} trên Casso chưa được chấp thuận. Vui lòng liên hệ đội ngũ hỗ trợ nếu bạn cho rằng đây là nhầm lẫn.</p>`,
        emailType: 'ORGANIZATION_REJECTED',
      });
    } catch (error) {
      this.logger.error('Failed to enqueue organization rejected email', {
        to,
        organizationName,
        error: error instanceof Error ? error.message : String(error),
      });
      throw AppError.withCause(
        error,
        ErrorCode.EMAIL_SEND_FAILED,
        'Không thể gửi email thông báo từ chối tổ chức.',
      );
    }
  }
}
