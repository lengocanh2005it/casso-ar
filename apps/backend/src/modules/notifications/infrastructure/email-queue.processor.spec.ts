import { SmtpConfigStatus } from '../../smtp-config/domain/organization-smtp-config';
import { EmailQueueProcessor } from './email-queue.processor';

function buildJob(
  overrides: Partial<{
    attemptsMade: number;
    attempts: number;
    forceProvider: 'RESEND';
    fromName?: string;
  }> = {},
) {
  return {
    name: 'send-reminder-email',
    id: 'exec-1',
    data: {
      reminderExecutionId: 'exec-1',
      receivableId: 'rec-1',
      organizationId: 'org-1',
      to: 'customer@example.com',
      replyTo: 'owner@example.com',
      subject: 'Payment reminder',
      html: '<p>Due</p>',
      ...(overrides.forceProvider
        ? { forceProvider: overrides.forceProvider }
        : {}),
      ...(overrides.fromName ? { fromName: overrides.fromName } : {}),
    },
    attemptsMade: overrides.attemptsMade ?? 1,
    opts: { attempts: overrides.attempts ?? 3 },
  } as any;
}

function buildProcessor(
  deps: ReturnType<typeof buildDeps>,
): EmailQueueProcessor {
  return new EmailQueueProcessor(
    deps.resolver as any,
    deps.executionRepo as any,
    deps.smtpConfigRepo as any,
    deps.membershipRepo as any,
    deps.userRepo as any,
    deps.tenantContext as any,
    deps.eventEmitter as any,
    deps.metrics as any,
    deps.requestIdStore as any,
    deps.emailQueue as any,
    deps.storage as any,
  );
}

function buildDeps() {
  return {
    resolver: { resolve: jest.fn() },
    executionRepo: {
      getStatus: jest.fn().mockResolvedValue('PENDING'),
      updateSendResult: jest.fn(),
    },
    smtpConfigRepo: {
      findByOrganizationId: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
      markFailedIfVersionMatches: jest.fn().mockResolvedValue(true),
    },
    membershipRepo: {
      findOwnerByOrganization: jest.fn().mockResolvedValue({
        userId: 'owner-1',
      }),
    },
    userRepo: {
      findById: jest.fn().mockResolvedValue({ email: 'owner@congtyb.vn' }),
    },
    tenantContext: {
      run: jest.fn((_user: unknown, callback: () => Promise<void>) =>
        callback(),
      ),
    },
    eventEmitter: { emit: jest.fn() },
    metrics: { incrementBullmqJobFailed: jest.fn() },
    requestIdStore: {
      run: jest.fn((_id: string, callback: () => Promise<void>) => callback()),
      getRequestId: jest.fn().mockReturnValue('request-1'),
    },
    emailQueue: { add: jest.fn() },
    storage: {
      exists: jest.fn().mockResolvedValue(true),
      read: jest.fn().mockResolvedValue(Buffer.from('file-bytes')),
    },
  };
}

describe('EmailQueueProcessor', () => {
  it('passes auth email text and branding attachments to the Resend provider', async () => {
    const emailProvider = {
      send: jest.fn().mockResolvedValue({ providerMessageId: 'auth-msg-1' }),
    };
    const deps = buildDeps();
    deps.resolver.resolve.mockResolvedValue(emailProvider);
    const processor = buildProcessor(deps);

    await processor.process({
      name: 'send-auth-email',
      id: 'auth-1',
      data: {
        to: 'owner@example.com',
        subject: 'Xác thực địa chỉ email',
        html: '<p>Verify</p>',
        text: 'Verify',
        attachments: [
          {
            filename: 'casso-ledger-logo.png',
            content: 'base64-logo',
            contentId: 'casso-ledger-logo',
            contentType: 'image/png',
          },
        ],
        emailType: 'AUTH_VERIFICATION',
      },
    } as any);

    expect(emailProvider.send).toHaveBeenCalledWith(
      'owner@example.com',
      'Xác thực địa chỉ email',
      '<p>Verify</p>',
      { emailType: 'AUTH_VERIFICATION' },
      undefined,
      undefined,
      {
        text: 'Verify',
        attachments: [
          expect.objectContaining({
            filename: 'casso-ledger-logo.png',
            contentId: 'casso-ledger-logo',
          }),
        ],
      },
    );
  });

  it('passes owner-alert branding attachments to the Resend provider', async () => {
    const emailProvider = {
      send: jest.fn().mockResolvedValue({ providerMessageId: 'alert-msg-1' }),
    };
    const deps = buildDeps();
    deps.resolver.resolve.mockResolvedValue(emailProvider);
    const processor = buildProcessor(deps);

    await processor.process({
      name: 'send-owner-alert',
      id: 'alert-1',
      data: {
        organizationId: 'org-1',
        to: 'owner@example.com',
        subject: 'Thông báo Casso',
        html: '<p>Alert</p>',
        text: 'Alert',
        attachments: [
          {
            filename: 'casso-ledger-logo.png',
            content: 'base64-logo',
            contentId: 'casso-ledger-logo',
            contentType: 'image/png',
          },
        ],
      },
    } as any);

    expect(emailProvider.send).toHaveBeenCalledWith(
      'owner@example.com',
      'Thông báo Casso',
      '<p>Alert</p>',
      { emailType: 'OWNER_ALERT' },
      undefined,
      undefined,
      {
        text: 'Alert',
        attachments: [
          expect.objectContaining({ contentId: 'casso-ledger-logo' }),
        ],
      },
    );
  });

  it('sends the email and records SENT with the provider id', async () => {
    const emailProvider = {
      send: jest.fn().mockResolvedValue({ providerMessageId: 'msg-1' }),
    };
    const deps = buildDeps();
    deps.resolver.resolve.mockResolvedValue(emailProvider);
    const processor = buildProcessor(deps);

    await processor.process(buildJob());

    expect(deps.resolver.resolve).toHaveBeenCalledWith('org-1', undefined);
    expect(emailProvider.send).toHaveBeenCalledWith(
      'customer@example.com',
      'Payment reminder',
      '<p>Due</p>',
      { reminderExecutionId: 'exec-1' },
      'owner@example.com',
      undefined,
      undefined,
    );
    expect(deps.executionRepo.updateSendResult).toHaveBeenCalledWith(
      'exec-1',
      'SENT',
      'msg-1',
    );
    expect(deps.eventEmitter.emit).toHaveBeenCalledWith(
      'reminder.execution.completed',
      {
        id: 'exec-1',
        status: 'SENT',
        providerMessageId: 'msg-1',
        organizationId: 'org-1',
      },
    );
    expect(deps.requestIdStore.run).toHaveBeenCalledWith(
      'bullmq:exec-1',
      expect.any(Function),
    );
  });

  it('passes the job fromName through to the provider (issue #96)', async () => {
    const emailProvider = {
      send: jest.fn().mockResolvedValue({ providerMessageId: 'msg-1' }),
    };
    const deps = buildDeps();
    deps.resolver.resolve.mockResolvedValue(emailProvider);
    const processor = buildProcessor(deps);

    await processor.process(buildJob({ fromName: 'Công ty ABC (qua Casso)' }));

    expect(emailProvider.send).toHaveBeenCalledWith(
      'customer@example.com',
      'Payment reminder',
      '<p>Due</p>',
      { reminderExecutionId: 'exec-1' },
      'owner@example.com',
      'Công ty ABC (qua Casso)',
      undefined,
    );
  });

  it('skips sending when a previous attempt already recorded SENT', async () => {
    const emailProvider = {
      send: jest.fn().mockResolvedValue({ providerMessageId: 'msg-1' }),
    };
    const deps = buildDeps();
    deps.resolver.resolve.mockResolvedValue(emailProvider);
    deps.executionRepo.getStatus.mockResolvedValue('SENT');
    const processor = buildProcessor(deps);

    await processor.process(buildJob());

    expect(emailProvider.send).not.toHaveBeenCalled();
    expect(deps.executionRepo.updateSendResult).not.toHaveBeenCalled();
  });

  it('records FAILED only after the final retry', async () => {
    const deps = buildDeps();
    const processor = buildProcessor(deps);

    await processor.onFailed(buildJob({ attemptsMade: 2, attempts: 3 }));
    expect(deps.executionRepo.updateSendResult).not.toHaveBeenCalled();
    expect(deps.metrics.incrementBullmqJobFailed).toHaveBeenCalledWith(
      'email-queue',
    );

    await processor.onFailed(buildJob({ attemptsMade: 3, attempts: 3 }));
    expect(deps.executionRepo.updateSendResult).toHaveBeenCalledWith(
      'exec-1',
      'FAILED',
      null,
    );

    await processor.onFailed({
      ...buildJob({ attemptsMade: 3, attempts: 3 }),
      name: 'send-auth-email',
    });
    expect(deps.metrics.incrementBullmqJobFailed).toHaveBeenCalledTimes(3);
    expect(deps.requestIdStore.run).toHaveBeenCalledWith(
      'bullmq:exec-1',
      expect.any(Function),
    );
  });
});

describe('EmailQueueProcessor — provider resolution', () => {
  it('resolves the adapter per organization via IEmailProviderResolver', async () => {
    const deps = buildDeps();
    const orgAdapter = {
      send: jest.fn().mockResolvedValue({ providerMessageId: 'smtp-msg-1' }),
    };
    deps.resolver.resolve.mockResolvedValue(orgAdapter);

    await buildProcessor(deps).process(buildJob());

    expect(deps.resolver.resolve).toHaveBeenCalledWith('org-1', undefined);
    expect(orgAdapter.send).toHaveBeenCalled();
  });

  it('on SMTP exhaustion flips CONNECTED to FAILED, warns via Resend, and requeues the reminder', async () => {
    const deps = buildDeps();
    const warningAdapter = {
      send: jest.fn().mockResolvedValue({ providerMessageId: 'warn-1' }),
    };
    deps.resolver.resolve.mockImplementation(
      (_organizationId: string, forceProvider?: 'RESEND') =>
        forceProvider === 'RESEND' ? warningAdapter : { send: jest.fn() },
    );
    deps.smtpConfigRepo.findByOrganizationId.mockResolvedValue({
      status: SmtpConfigStatus.CONNECTED,
      organizationId: 'org-1',
      isConnected: jest.fn().mockReturnValue(true),
      markFailed: jest.fn().mockReturnValue({
        status: SmtpConfigStatus.FAILED,
        organizationId: 'org-1',
      }),
    });

    await buildProcessor(deps).onFailed(
      buildJob({ attemptsMade: 3, attempts: 3 }),
    );

    expect(deps.membershipRepo.findOwnerByOrganization).toHaveBeenCalledWith(
      'org-1',
    );
    expect(deps.userRepo.findById).toHaveBeenCalledWith('owner-1');
    expect(warningAdapter.send).toHaveBeenCalledWith(
      'owner@congtyb.vn',
      expect.any(String),
      expect.stringContaining('cid:casso-ledger-logo'),
      { emailType: 'SMTP_CONNECTION_FAILED_WARNING' },
      undefined,
      undefined,
      expect.objectContaining({
        text: expect.any(String),
        attachments: [
          expect.objectContaining({ contentId: 'casso-ledger-logo' }),
        ],
      }),
    );
    const warningCall = warningAdapter.send.mock.calls[0];
    expect(warningCall[2]).toContain('cid:casso-ledger-logo');
    expect(warningCall[6]).toEqual({
      text: expect.any(String),
      attachments: [
        expect.objectContaining({ contentId: 'casso-ledger-logo' }),
      ],
    });
    expect(deps.smtpConfigRepo.markFailedIfVersionMatches).toHaveBeenCalledWith(
      expect.objectContaining({ status: SmtpConfigStatus.FAILED }),
    );
    expect(deps.executionRepo.updateSendResult).not.toHaveBeenCalled();
    expect(deps.emailQueue.add).toHaveBeenCalledWith(
      'send-reminder-email',
      expect.objectContaining({
        reminderExecutionId: 'exec-1',
        forceProvider: 'RESEND',
      }),
      expect.objectContaining({ jobId: 'exec-1-resend-fallback' }),
    );
  });

  it('emits SMTP_CONFIG_FAILED with the org and config id when the SMTP config transitions to FAILED', async () => {
    const deps = buildDeps();
    deps.smtpConfigRepo.findByOrganizationId.mockResolvedValue({
      id: 'smtp-1',
      organizationId: 'org-1',
      isConnected: () => true,
      markFailed: () => ({
        id: 'smtp-1',
        organizationId: 'org-1',
        status: 'FAILED',
      }),
    });
    deps.smtpConfigRepo.markFailedIfVersionMatches.mockResolvedValue(true);
    const processor = buildProcessor(deps);

    await processor.onFailed(buildJob({ attemptsMade: 3, attempts: 3 }));

    expect(deps.eventEmitter.emit).toHaveBeenCalledWith('smtp-config.failed', {
      organizationId: 'org-1',
      smtpConfigId: 'smtp-1',
    });
  });

  it('still rescues the reminder via the Resend fallback (but skips the warning) when another concurrent job already won the SMTP transition', async () => {
    // Regression test: two reminder jobs for the same org exhausting SMTP
    // retries at the same time must never both silently drop their reminder.
    // Only the job that actually performs the CONNECTED -> FAILED transition
    // sends the one-time warning; every affected reminder — winner and loser
    // of the race alike — must still be requeued through Resend.
    const deps = buildDeps();
    const warningAdapter = { send: jest.fn() };
    deps.resolver.resolve.mockResolvedValue(warningAdapter);
    deps.smtpConfigRepo.findByOrganizationId.mockResolvedValue({
      status: SmtpConfigStatus.CONNECTED,
      organizationId: 'org-1',
      isConnected: jest.fn().mockReturnValue(true),
      markFailed: jest.fn().mockReturnValue({
        status: SmtpConfigStatus.FAILED,
        organizationId: 'org-1',
      }),
    });
    deps.smtpConfigRepo.markFailedIfVersionMatches.mockResolvedValue(false);

    await buildProcessor(deps).onFailed(
      buildJob({ attemptsMade: 3, attempts: 3 }),
    );

    expect(warningAdapter.send).not.toHaveBeenCalled();
    expect(deps.executionRepo.updateSendResult).not.toHaveBeenCalled();
    expect(deps.emailQueue.add).toHaveBeenCalledWith(
      'send-reminder-email',
      expect.objectContaining({
        reminderExecutionId: 'exec-1',
        forceProvider: 'RESEND',
      }),
      expect.objectContaining({ jobId: 'exec-1-resend-fallback' }),
    );
  });

  it('on final exhaustion of a forced Resend retry marks the execution FAILED', async () => {
    const deps = buildDeps();

    await buildProcessor(deps).onFailed(
      buildJob({ attemptsMade: 3, attempts: 3, forceProvider: 'RESEND' }),
    );

    expect(deps.executionRepo.updateSendResult).toHaveBeenCalledWith(
      'exec-1',
      'FAILED',
      null,
    );
    expect(deps.emailQueue.add).not.toHaveBeenCalled();
    expect(deps.smtpConfigRepo.findByOrganizationId).not.toHaveBeenCalled();
  });

  it('on final exhaustion with no SMTP config keeps the existing FAILED behavior', async () => {
    const deps = buildDeps();

    await buildProcessor(deps).onFailed(
      buildJob({ attemptsMade: 3, attempts: 3 }),
    );

    expect(deps.executionRepo.updateSendResult).toHaveBeenCalledWith(
      'exec-1',
      'FAILED',
      null,
    );
    expect(deps.emailQueue.add).not.toHaveBeenCalled();
  });

  it('reads attachment refs from storage, marks cid-referenced ones inline, and passes them to adapter.send', async () => {
    const send = jest.fn().mockResolvedValue({ providerMessageId: 'msg-1' });
    const deps = buildDeps();
    deps.resolver.resolve.mockResolvedValue({ send });
    deps.storage.exists.mockResolvedValue(true);
    deps.storage.read.mockResolvedValue(Buffer.from('file-bytes'));
    const processor = buildProcessor(deps);

    const job = {
      id: 'job-1',
      name: 'send-reminder-email',
      data: {
        reminderExecutionId: 'exec-1',
        organizationId: 'org-1',
        to: 'a@b.com',
        subject: 'Hi',
        html: '<p><img src="cid:logo.png"></p>',
        attachmentRefs: [
          {
            storageKey: 'org-1/tpl-1/uuid1.png',
            filename: 'logo.png',
            mimeType: 'image/png',
          },
          {
            storageKey: 'org-1/tpl-1/uuid2.pdf',
            filename: 'invoice.pdf',
            mimeType: 'application/pdf',
          },
        ],
      },
      opts: { attempts: 3 },
      attemptsMade: 0,
    } as any;

    await processor.process(job);

    expect(send).toHaveBeenCalledWith(
      'a@b.com',
      'Hi',
      '<p><img src="cid:logo.png"></p>',
      { reminderExecutionId: 'exec-1' },
      undefined,
      undefined,
      {
        attachments: [
          {
            filename: 'logo.png',
            content: Buffer.from('file-bytes').toString('base64'),
            contentId: 'logo.png',
            contentType: 'image/png',
          },
          {
            filename: 'invoice.pdf',
            content: Buffer.from('file-bytes').toString('base64'),
            contentType: 'application/pdf',
          },
        ],
      },
    );
  });

  it('skips a referenced attachment that no longer exists on disk instead of failing the send', async () => {
    const send = jest.fn().mockResolvedValue({ providerMessageId: 'msg-1' });
    const deps = buildDeps();
    deps.resolver.resolve.mockResolvedValue({ send });
    deps.storage.exists.mockResolvedValue(false);
    const processor = buildProcessor(deps);

    const job = {
      id: 'job-1',
      name: 'send-reminder-email',
      data: {
        reminderExecutionId: 'exec-1',
        organizationId: 'org-1',
        to: 'a@b.com',
        subject: 'Hi',
        html: '<p>hi</p>',
        attachmentRefs: [
          {
            storageKey: 'org-1/tpl-1/uuid1.png',
            filename: 'deleted.png',
            mimeType: 'image/png',
          },
        ],
      },
      opts: { attempts: 3 },
      attemptsMade: 0,
    } as any;

    await processor.process(job);

    expect(deps.storage.read).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(
      'a@b.com',
      'Hi',
      '<p>hi</p>',
      { reminderExecutionId: 'exec-1' },
      undefined,
      undefined,
      undefined,
    );
  });
});
