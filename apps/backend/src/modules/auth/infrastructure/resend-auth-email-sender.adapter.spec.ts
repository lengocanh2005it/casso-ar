import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { ResendAuthEmailSenderAdapter } from './resend-auth-email-sender.adapter';

describe('ResendAuthEmailSenderAdapter', () => {
  it('queues verification email', async () => {
    const emailQueue = { add: jest.fn().mockResolvedValue(undefined) };
    await new ResendAuthEmailSenderAdapter(
      emailQueue as any,
    ).sendVerificationEmail(
      'user@example.com',
      'https://app.casso.vn/verify?token=abc',
    );
    expect(emailQueue.add).toHaveBeenCalledWith('send-auth-email', {
      to: 'user@example.com',
      subject: expect.any(String),
      html: expect.stringContaining('https://app.casso.vn/verify?token=abc'),
      emailType: 'AUTH_VERIFICATION',
    });
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
      adapter.sendVerificationEmail(
        'user@example.com',
        'https://app.casso.vn/verify?token=abc',
      ),
    ).rejects.toThrow(AppError);

    try {
      await adapter.sendVerificationEmail(
        'user@example.com',
        'https://app.casso.vn/verify?token=abc',
      );
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).errorCode).toBe(ErrorCode.EMAIL_SEND_FAILED);
      expect((error as AppError).cause).toBeInstanceOf(Error);
      expect(((error as AppError).cause as Error).message).toBe('Queue full');
    }
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
});
