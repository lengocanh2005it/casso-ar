import { SmtpConfigStatus } from '../../smtp-config/domain/organization-smtp-config';
import { SmtpEmailAdapter } from './smtp-email.adapter';

describe('SmtpEmailAdapter', () => {
  function buildConfig() {
    return {
      id: 'smtp-1',
      organizationId: 'org-1',
      host: 'smtp.congtyb.vn',
      port: 587,
      username: 'noreply@congtyb.vn',
      encryptedPassword: 'ciphertext',
      fromAddress: 'noreply@congtyb.vn',
      status: SmtpConfigStatus.CONNECTED,
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 1,
    } as any;
  }

  it('decrypts the password, sends via the org from-address, and returns a providerMessageId', async () => {
    const sendMail = jest.fn().mockResolvedValue({ messageId: 'smtp-msg-1' });
    const transportFactory = jest.fn().mockReturnValue({ sendMail });
    const decryptFn = jest.fn().mockReturnValue('plaintext-password');

    const adapter = new SmtpEmailAdapter(
      buildConfig(),
      'a'.repeat(64),
      transportFactory,
      decryptFn,
    );
    const result = await adapter.send(
      'customer@example.com',
      'Reminder',
      '<p>Due</p>',
      {},
      'owner@congtyb.vn',
    );

    expect(decryptFn).toHaveBeenCalledWith('ciphertext', 'a'.repeat(64));
    expect(transportFactory).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.congtyb.vn',
        password: 'plaintext-password',
      }),
    );
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'noreply@congtyb.vn',
        to: 'customer@example.com',
        replyTo: 'owner@congtyb.vn',
      }),
    );
    expect(result).toEqual({ providerMessageId: 'smtp-msg-1' });
  });

  it('propagates a rejected sendMail as an error', async () => {
    const sendMail = jest
      .fn()
      .mockRejectedValue(new Error('connection refused'));
    const transportFactory = jest.fn().mockReturnValue({ sendMail });

    const adapter = new SmtpEmailAdapter(
      buildConfig(),
      'a'.repeat(64),
      transportFactory,
      () => 'plaintext',
    );

    await expect(
      adapter.send('c@example.com', 's', '<p>h</p>', {}),
    ).rejects.toThrow('connection refused');
  });

  it('maps plain text and CID attachments to Nodemailer', async () => {
    const sendMail = jest
      .fn()
      .mockResolvedValue({ messageId: 'smtp-msg-inline' });
    const transportFactory = jest.fn().mockReturnValue({ sendMail });
    const adapter = new SmtpEmailAdapter(
      buildConfig(),
      'a'.repeat(64),
      transportFactory,
      () => 'plaintext',
    );

    await adapter.send(
      'owner@example.com',
      'Verify',
      '<p>Verify</p>',
      {},
      undefined,
      undefined,
      {
        text: 'Verify at https://app.casso.vn/verify',
        attachments: [
          {
            filename: 'casso-ar-logo.png',
            content: 'base64-logo',
            contentId: 'casso-ar-logo',
            contentType: 'image/png',
          },
        ],
      },
    );

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Verify at https://app.casso.vn/verify',
        attachments: [
          {
            filename: 'casso-ar-logo.png',
            content: 'base64-logo',
            encoding: 'base64',
            cid: 'casso-ar-logo',
            contentType: 'image/png',
          },
        ],
      }),
    );
  });
});
