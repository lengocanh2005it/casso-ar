const sendMock = jest.fn();

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: sendMock } })),
}));

import { ResendEmailAdapter } from './resend-email.adapter';

describe('ResendEmailAdapter', () => {
  beforeEach(() => {
    sendMock.mockReset();
    process.env.RESEND_API_KEY = 'test-api-key';
    process.env.RESEND_FROM_ADDRESS = 'no-reply@casso-ar.vn';
  });

  it('returns the provider message id and sends the configured message', async () => {
    sendMock.mockResolvedValue({ data: { id: 'resend-msg-1' }, error: null });

    const result = await new ResendEmailAdapter().send(
      'customer@example.com',
      'Payment reminder',
      '<p>Due</p>',
      { reminderExecutionId: 'exec-1' },
    );

    expect(result).toEqual({ providerMessageId: 'resend-msg-1' });
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'no-reply@casso-ar.vn',
        to: 'customer@example.com',
        subject: 'Payment reminder',
        html: '<p>Due</p>',
      }),
    );
  });

  it('passes replyTo to Resend', async () => {
    sendMock.mockResolvedValue({ data: { id: 'resend-msg-2' }, error: null });

    await new ResendEmailAdapter().send(
      'customer@example.com',
      'Payment reminder',
      '<p>Due</p>',
      {},
      'owner@example.com',
    );

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ replyTo: 'owner@example.com' }),
    );
  });

  it('passes the delivery cancellation signal and idempotency key to Resend', async () => {
    sendMock.mockResolvedValue({
      data: { id: 'resend-msg-locked' },
      error: null,
    });
    const controller = new AbortController();

    await new ResendEmailAdapter().send(
      'customer@example.com',
      'Payment reminder',
      '<p>Due</p>',
      { reminderExecutionId: 'exec-1' },
      undefined,
      undefined,
      {
        signal: controller.signal,
        idempotencyKey: 'reminder-attempt-1',
      },
    );

    expect(sendMock).toHaveBeenCalledWith(expect.any(Object), {
      signal: controller.signal,
      idempotencyKey: 'reminder-attempt-1',
    });
  });

  it('passes plain text and inline attachments to Resend', async () => {
    sendMock.mockResolvedValue({
      data: { id: 'resend-msg-inline' },
      error: null,
    });

    await new ResendEmailAdapter().send(
      'owner@example.com',
      'Verify',
      '<p>Verify</p>',
      { emailType: 'AUTH_VERIFICATION' },
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

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Verify at https://app.casso.vn/verify',
        attachments: [
          {
            filename: 'casso-ar-logo.png',
            content: 'base64-logo',
            contentId: 'casso-ar-logo',
          },
        ],
      }),
    );
  });

  it('builds a display-name From header when fromName is provided', async () => {
    sendMock.mockResolvedValue({ data: { id: 'resend-msg-3' }, error: null });

    await new ResendEmailAdapter().send(
      'customer@example.com',
      'Payment reminder',
      '<p>Due</p>',
      {},
      undefined,
      'Công ty ABC (qua Casso)',
    );

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '"Công ty ABC (qua Casso)" <no-reply@casso-ar.vn>',
      }),
    );
  });

  it('sanitizes quotes inside the display name', async () => {
    sendMock.mockResolvedValue({ data: { id: 'resend-msg-4' }, error: null });

    await new ResendEmailAdapter().send(
      'customer@example.com',
      'Payment reminder',
      '<p>Due</p>',
      {},
      undefined,
      'Bad "name"',
    );

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '"Bad \'name\'" <no-reply@casso-ar.vn>',
      }),
    );
  });

  it('fails fast when RESEND_API_KEY is not set', () => {
    delete process.env.RESEND_API_KEY;

    expect(() => new ResendEmailAdapter()).toThrow(/RESEND_API_KEY/);
  });

  it('fails fast when RESEND_API_KEY is set but empty', () => {
    process.env.RESEND_API_KEY = '';

    expect(() => new ResendEmailAdapter()).toThrow(/RESEND_API_KEY/);
  });

  it('throws when Resend returns an error', async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: { message: 'invalid API key' },
    });

    await expect(
      new ResendEmailAdapter().send(
        'customer@example.com',
        'Subject',
        '<p>Due</p>',
        {},
      ),
    ).rejects.toThrow('Resend send failed: invalid API key');
  });
});
