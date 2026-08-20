import { Inject, Injectable, Logger } from '@nestjs/common';
import type { CassoEmailContent } from '../../../common/email/casso-email-template';
import { buildCassoEmail } from '../../../common/email/casso-email-template';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  EMAIL_QUEUE_PORT,
  type IEmailQueue,
} from '../../notifications/application/email-queue.port';
import type { IAuthEmailSender } from '../application/auth-email-sender.port';
import type { IMemberNotificationSender } from '../application/member-notification.port';

function toAbsoluteAppUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;

  const configuredBaseUrl = (
    process.env.APP_WEB_URL ??
    process.env.CORS_ORIGIN ??
    'http://localhost:5173'
  ).trim();
  const baseUrl = configuredBaseUrl || 'http://localhost:5173';
  return new URL(url, `${baseUrl.replace(/\/+$/, '')}/`).toString();
}

function subjectPart(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

@Injectable()
export class ResendAuthEmailSenderAdapter
  implements IAuthEmailSender, IMemberNotificationSender
{
  private readonly logger = new Logger(ResendAuthEmailSenderAdapter.name);

  constructor(
    @Inject(EMAIL_QUEUE_PORT) private readonly emailQueue: IEmailQueue,
  ) {}

  private async enqueue(
    to: string,
    subject: string,
    content: CassoEmailContent,
    emailType:
      | 'AUTH_VERIFICATION'
      | 'AUTH_PASSWORD_RESET'
      | 'AUTH_INVITE'
      | 'AUTH_CHANGE_PASSWORD_OTP'
      | 'MEMBER_BLOCKED'
      | 'MEMBER_UNBLOCKED'
      | 'ORGANIZATION_APPROVED'
      | 'ORGANIZATION_REJECTED',
  ): Promise<void> {
    try {
      await this.emailQueue.add('send-auth-email', {
        to,
        subject,
        html: content.html,
        text: content.text,
        attachments: content.attachments,
        emailType,
      });
    } catch (error) {
      this.logger.error('Failed to enqueue auth email', {
        to,
        emailType,
        error: error instanceof Error ? error.message : String(error),
      });
      throw AppError.withCause(
        error,
        ErrorCode.EMAIL_SEND_FAILED,
        'Không thể gửi email hệ thống. Vui lòng thử lại sau.',
      );
    }
  }

  async sendVerificationEmail(to: string, otp: string): Promise<void> {
    return this.enqueue(
      to,
      'Mã xác thực email | Casso Ledger',
      buildCassoEmail({
        title: 'Mã xác thực email',
        greeting: 'Kính chào Quý khách,',
        paragraphs: [
          `Mã xác thực email của Quý khách là: ${otp}.`,
          'Mã có hiệu lực trong 10 phút. Vui lòng không chia sẻ mã này với bất kỳ ai.',
        ],
      }),
      'AUTH_VERIFICATION',
    );
  }

  async sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
    const url = toAbsoluteAppUrl(resetUrl);
    return this.enqueue(
      to,
      'Đặt lại mật khẩu Casso Ledger',
      buildCassoEmail({
        title: 'Đặt lại mật khẩu',
        greeting: 'Kính chào Quý khách,',
        paragraphs: [
          'Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản Casso Ledger của Quý khách.',
          'Nếu đây là yêu cầu của Quý khách, vui lòng nhấn nút bên dưới. Liên kết này có hiệu lực trong 45 phút.',
          'Nếu Quý khách không thực hiện yêu cầu này, vui lòng bỏ qua email và bảo mật tài khoản của mình.',
        ],
        action: { label: 'Đặt lại mật khẩu', url },
      }),
      'AUTH_PASSWORD_RESET',
    );
  }

  async sendChangePasswordOtpEmail(to: string, otp: string): Promise<void> {
    return this.enqueue(
      to,
      'Mã OTP đổi mật khẩu | Casso Ledger',
      buildCassoEmail({
        title: 'Mã OTP đổi mật khẩu',
        greeting: 'Kính chào Quý khách,',
        paragraphs: [
          `Mã OTP đổi mật khẩu của Quý khách là: ${otp}.`,
          'Mã có hiệu lực trong 5 phút. Vui lòng không chia sẻ mã này với bất kỳ ai.',
        ],
      }),
      'AUTH_CHANGE_PASSWORD_OTP',
    );
  }

  async sendInviteEmail(
    to: string,
    acceptUrl: string,
    organizationName: string,
  ): Promise<void> {
    const url = toAbsoluteAppUrl(acceptUrl);
    const safeOrganizationName = subjectPart(organizationName);
    return this.enqueue(
      to,
      `Lời mời tham gia ${safeOrganizationName} trên Casso Ledger`,
      buildCassoEmail({
        title: 'Lời mời tham gia Casso Ledger',
        greeting: 'Kính chào Quý khách,',
        paragraphs: [
          `Quý khách được mời tham gia quản lý tổ chức ${organizationName} trên Casso Ledger.`,
          'Vui lòng nhấn nút bên dưới để chấp nhận lời mời. Liên kết này có hiệu lực trong 7 ngày.',
        ],
        action: { label: 'Chấp nhận lời mời', url },
      }),
      'AUTH_INVITE',
    );
  }

  async sendMemberBlockedEmail(
    to: string,
    organizationName: string,
  ): Promise<void> {
    return this.enqueue(
      to,
      `Quyền truy cập vào ${subjectPart(organizationName)} đã bị tạm khóa`,
      buildCassoEmail({
        title: 'Thông báo về quyền truy cập',
        greeting: 'Kính chào Quý khách,',
        paragraphs: [
          `Quyền truy cập của Quý khách vào tổ chức ${organizationName} trên Casso Ledger đã bị tạm khóa.`,
          'Vui lòng liên hệ quản trị viên của tổ chức nếu Quý khách cho rằng đây là nhầm lẫn.',
        ],
      }),
      'MEMBER_BLOCKED',
    );
  }

  async sendMemberUnblockedEmail(
    to: string,
    organizationName: string,
  ): Promise<void> {
    return this.enqueue(
      to,
      `Quyền truy cập vào ${subjectPart(organizationName)} đã được khôi phục`,
      buildCassoEmail({
        title: 'Quyền truy cập đã được khôi phục',
        greeting: 'Kính chào Quý khách,',
        paragraphs: [
          `Quyền truy cập của Quý khách vào tổ chức ${organizationName} trên Casso Ledger đã được khôi phục.`,
          'Quý khách có thể đăng nhập để tiếp tục sử dụng dịch vụ.',
        ],
      }),
      'MEMBER_UNBLOCKED',
    );
  }

  async sendOrganizationApprovedEmail(
    to: string,
    organizationName: string,
  ): Promise<void> {
    return this.enqueue(
      to,
      `Tổ chức ${subjectPart(organizationName)} đã được phê duyệt`,
      buildCassoEmail({
        title: 'Tổ chức đã được phê duyệt',
        greeting: 'Kính chào Quý khách,',
        paragraphs: [
          `Hồ sơ đăng ký tổ chức ${organizationName} trên Casso Ledger đã được phê duyệt.`,
          'Quý khách có thể đăng nhập để bắt đầu sử dụng dịch vụ.',
        ],
      }),
      'ORGANIZATION_APPROVED',
    );
  }

  async sendOrganizationRejectedEmail(
    to: string,
    organizationName: string,
  ): Promise<void> {
    return this.enqueue(
      to,
      `Hồ sơ đăng ký ${subjectPart(organizationName)} chưa được chấp thuận`,
      buildCassoEmail({
        title: 'Hồ sơ đăng ký tổ chức chưa được chấp thuận',
        greeting: 'Kính chào Quý khách,',
        paragraphs: [
          `Hồ sơ đăng ký tổ chức ${organizationName} trên Casso Ledger hiện chưa được chấp thuận.`,
          'Vui lòng liên hệ đội ngũ hỗ trợ nếu Quý khách cần được giải đáp thêm.',
        ],
      }),
      'ORGANIZATION_REJECTED',
    );
  }
}
