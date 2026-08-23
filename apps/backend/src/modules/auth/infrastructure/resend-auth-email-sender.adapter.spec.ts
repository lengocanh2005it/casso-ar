import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { ResendAuthEmailSenderAdapter } from './resend-auth-email-sender.adapter';

describe('ResendAuthEmailSenderAdapter', () => {
  afterEach(() => {
    delete process.env.APP_WEB_URL;
  });

  it('localizes and brands verification OTP email', async () => {
    const emailQueue = { add: jest.fn().mockResolvedValue(undefined) };
    const adapter = new ResendAuthEmailSenderAdapter(emailQueue as any);

    await adapter.sendVerificationEmail('owner@example.com', '482913');

    expect(emailQueue.add).toHaveBeenCalledWith(
      'send-auth-email',
      expect.objectContaining({
        to: 'owner@example.com',
        subject: 'Mã xác thực email | Casso Ledger',
        html: expect.stringContaining('482913'),
        text: expect.stringContaining('482913'),
        attachments: [
          expect.objectContaining({
            filename: 'casso-ledger-logo.png',
            contentId: 'casso-ledger-logo',
          }),
        ],
        emailType: 'AUTH_VERIFICATION',
      }),
    );
  });

  it('escapes organization names in invitation email HTML', async () => {
    const emailQueue = { add: jest.fn().mockResolvedValue(undefined) };
    const adapter = new ResendAuthEmailSenderAdapter(emailQueue as any);

    await adapter.sendInviteEmail(
      'owner@example.com',
      '/invites/accept?token=abc',
      '<Công ty> & Đối tác',
    );

    const [, job] = emailQueue.add.mock.calls[0];
    expect(job.html).toContain('&lt;Công ty&gt; &amp; Đối tác');
    expect(job.html).not.toContain('<Công ty>');
  });

  it('queues verification email', async () => {
    const emailQueue = { add: jest.fn().mockResolvedValue(undefined) };
    await new ResendAuthEmailSenderAdapter(
      emailQueue as any,
    ).sendVerificationEmail('user@example.com', '482913');
    expect(emailQueue.add).toHaveBeenCalledWith(
      'send-auth-email',
      expect.objectContaining({
        to: 'user@example.com',
        subject: 'Mã xác thực email | Casso Ledger',
        html: expect.stringContaining('482913'),
        text: expect.stringContaining('482913'),
        attachments: [
          expect.objectContaining({ contentId: 'casso-ledger-logo' }),
        ],
        emailType: 'AUTH_VERIFICATION',
      }),
    );
  });

  it('queues reset and invite emails', async () => {
    const emailQueue = { add: jest.fn().mockResolvedValue(undefined) };
    const adapter = new ResendAuthEmailSenderAdapter(emailQueue as any);
    await adapter.sendPasswordResetEmail(
      'user@example.com',
      'https://app/reset',
    );
    await adapter.sendInviteEmail(
      'user@example.com',
      'https://app/invite',
      'Company B',
    );
    expect(emailQueue.add).toHaveBeenNthCalledWith(
      1,
      'send-auth-email',
      expect.objectContaining({
        to: 'user@example.com',
        emailType: 'AUTH_PASSWORD_RESET',
      }),
    );
    expect(emailQueue.add).toHaveBeenNthCalledWith(
      2,
      'send-auth-email',
      expect.objectContaining({
        to: 'user@example.com',
        emailType: 'AUTH_INVITE',
      }),
    );
  });

  it('wraps queue errors as AppError with EMAIL_SEND_FAILED', async () => {
    const emailQueue = {
      add: jest.fn().mockRejectedValue(new Error('Queue full')),
    };
    const adapter = new ResendAuthEmailSenderAdapter(emailQueue as any);

    await expect(
      adapter.sendVerificationEmail('user@example.com', '482913'),
    ).rejects.toThrow(AppError);

    try {
      await adapter.sendVerificationEmail('user@example.com', '482913');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).errorCode).toBe(ErrorCode.EMAIL_SEND_FAILED);
      expect((error as AppError).cause).toBeInstanceOf(Error);
      expect(((error as AppError).cause as Error).message).toBe('Queue full');
    }
  });

  it('queues a change-password OTP email', async () => {
    const emailQueue = { add: jest.fn().mockResolvedValue(undefined) };
    const adapter = new ResendAuthEmailSenderAdapter(emailQueue as any);

    await adapter.sendChangePasswordOtpEmail('user@example.com', '123456');

    expect(emailQueue.add).toHaveBeenCalledWith('send-auth-email', {
      to: 'user@example.com',
      subject: 'Mã OTP đổi mật khẩu | Casso Ledger',
      html: expect.stringContaining('123456'),
      text: expect.stringContaining('123456'),
      attachments: [
        expect.objectContaining({ contentId: 'casso-ledger-logo' }),
      ],
      emailType: 'AUTH_CHANGE_PASSWORD_OTP',
    });
  });

  it('queues member blocked and unblocked emails', async () => {
    const emailQueue = { add: jest.fn().mockResolvedValue(undefined) };
    const adapter = new ResendAuthEmailSenderAdapter(emailQueue as any);

    await adapter.sendMemberBlockedEmail('member@example.com', 'Acme');
    await adapter.sendMemberUnblockedEmail('member@example.com', 'Acme');

    expect(emailQueue.add).toHaveBeenNthCalledWith(
      1,
      'send-auth-email',
      expect.objectContaining({
        to: 'member@example.com',
        html: expect.stringContaining('Acme'),
        emailType: 'MEMBER_BLOCKED',
      }),
    );
    expect(emailQueue.add).toHaveBeenNthCalledWith(
      2,
      'send-auth-email',
      expect.objectContaining({
        to: 'member@example.com',
        html: expect.stringContaining('Acme'),
        emailType: 'MEMBER_UNBLOCKED',
      }),
    );
  });

  it('sendOrganizationApprovedEmail enqueues an approval email', async () => {
    const emailQueue = { add: jest.fn() };
    const adapter = new ResendAuthEmailSenderAdapter(emailQueue as any);

    await adapter.sendOrganizationApprovedEmail('owner@acme.vn', 'Acme Co');

    expect(emailQueue.add).toHaveBeenCalledWith(
      'send-auth-email',
      expect.objectContaining({
        to: 'owner@acme.vn',
        subject: 'Tổ chức Acme Co đã được phê duyệt',
        html: expect.stringContaining('Acme Co'),
        text: expect.stringContaining('Acme Co'),
        attachments: [
          expect.objectContaining({ contentId: 'casso-ledger-logo' }),
        ],
        emailType: 'ORGANIZATION_APPROVED',
      }),
    );
  });

  it('sendOrganizationRejectedEmail enqueues a rejection email without a reason', async () => {
    const emailQueue = { add: jest.fn() };
    const adapter = new ResendAuthEmailSenderAdapter(emailQueue as any);

    await adapter.sendOrganizationRejectedEmail('owner@acme.vn', 'Acme Co');

    expect(emailQueue.add).toHaveBeenCalledWith(
      'send-auth-email',
      expect.objectContaining({
        to: 'owner@acme.vn',
        subject: 'Hồ sơ đăng ký Acme Co chưa được chấp thuận',
        html: expect.stringContaining('liên hệ'),
        text: expect.stringContaining('liên hệ'),
        attachments: [
          expect.objectContaining({ contentId: 'casso-ledger-logo' }),
        ],
        emailType: 'ORGANIZATION_REJECTED',
      }),
    );
  });
  it('enqueues an ownership transfer OTP email', async () => {
    const emailQueue = { add: jest.fn().mockResolvedValue(undefined) };
    const adapter = new ResendAuthEmailSenderAdapter(emailQueue as never);

    await adapter.sendOwnershipTransferOtpEmail('owner@acme.vn', '123456');

    expect(emailQueue.add).toHaveBeenCalledWith(
      'send-auth-email',
      expect.objectContaining({
        to: 'owner@acme.vn',
        emailType: 'OWNERSHIP_TRANSFER_OTP',
      }),
    );
  });

  it('enqueues an ownership transfer pending notification email', async () => {
    const emailQueue = { add: jest.fn().mockResolvedValue(undefined) };
    const adapter = new ResendAuthEmailSenderAdapter(emailQueue as never);

    await adapter.sendOwnershipTransferPendingEmail(
      'target@acme.vn',
      'Acme Corp',
    );

    expect(emailQueue.add).toHaveBeenCalledWith(
      'send-auth-email',
      expect.objectContaining({
        to: 'target@acme.vn',
        emailType: 'OWNERSHIP_TRANSFER_PENDING',
      }),
    );
  });
});
