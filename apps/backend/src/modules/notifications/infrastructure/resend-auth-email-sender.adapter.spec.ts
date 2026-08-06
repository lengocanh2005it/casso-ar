import { ResendAuthEmailSenderAdapter } from './resend-auth-email-sender.adapter';

describe('ResendAuthEmailSenderAdapter', () => {
  it('sends verification email through the provider port', async () => {
    const emailProvider = {
      send: jest.fn().mockResolvedValue({ providerMessageId: 'msg-1' }),
    };
    await new ResendAuthEmailSenderAdapter(
      emailProvider as any,
    ).sendVerificationEmail(
      'user@example.com',
      'https://app.casso.vn/verify?token=abc',
    );
    expect(emailProvider.send).toHaveBeenCalledWith(
      'user@example.com',
      expect.any(String),
      expect.stringContaining('https://app.casso.vn/verify?token=abc'),
      { emailType: 'AUTH_VERIFICATION' },
    );
  });

  it('sends reset and invite emails through the provider port', async () => {
    const emailProvider = {
      send: jest.fn().mockResolvedValue({ providerMessageId: 'msg-1' }),
    };
    const adapter = new ResendAuthEmailSenderAdapter(emailProvider as any);
    await adapter.sendPasswordResetEmail(
      'user@example.com',
      'https://app/reset',
    );
    await adapter.sendInviteEmail(
      'user@example.com',
      'https://app/invite',
      'Company B',
    );
    expect(emailProvider.send).toHaveBeenNthCalledWith(
      1,
      'user@example.com',
      expect.any(String),
      expect.stringContaining('https://app/reset'),
      { emailType: 'AUTH_PASSWORD_RESET' },
    );
    expect(emailProvider.send).toHaveBeenNthCalledWith(
      2,
      'user@example.com',
      expect.stringContaining('Company B'),
      expect.stringContaining('https://app/invite'),
      { emailType: 'AUTH_INVITE' },
    );
  });
});
