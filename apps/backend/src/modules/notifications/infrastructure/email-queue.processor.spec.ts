import { EmailQueueProcessor } from './email-queue.processor';

function buildJob(attemptsMade = 1, attempts = 3) {
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
    },
    attemptsMade,
    opts: { attempts },
  } as any;
}

describe('EmailQueueProcessor', () => {
  it('sends the email and records SENT with the provider id', async () => {
    const emailProvider = {
      send: jest.fn().mockResolvedValue({ providerMessageId: 'msg-1' }),
    };
    const executionRepo = {
      getStatus: jest.fn().mockResolvedValue('PENDING'),
      updateSendResult: jest.fn().mockResolvedValue(undefined),
    };
    const tenantContext = { run: jest.fn((_user, callback) => callback()) };
    const eventEmitter = { emit: jest.fn() };
    const processor = new EmailQueueProcessor(
      emailProvider as any,
      executionRepo as any,
      tenantContext as any,
      eventEmitter as any,
    );

    await processor.process(buildJob());

    expect(emailProvider.send).toHaveBeenCalledWith(
      'customer@example.com',
      'Payment reminder',
      '<p>Due</p>',
      { reminderExecutionId: 'exec-1' },
      'owner@example.com',
    );
    expect(executionRepo.updateSendResult).toHaveBeenCalledWith(
      'exec-1',
      'SENT',
      'msg-1',
    );
    expect(eventEmitter.emit).toHaveBeenCalledWith('reminder.sent', {
      reminderExecutionId: 'exec-1',
      receivableId: 'rec-1',
      organizationId: 'org-1',
    });
  });

  it('skips sending when a previous attempt already recorded SENT (retry after a partial failure)', async () => {
    const emailProvider = {
      send: jest.fn().mockResolvedValue({ providerMessageId: 'msg-1' }),
    };
    const executionRepo = {
      getStatus: jest.fn().mockResolvedValue('SENT'),
      updateSendResult: jest.fn().mockResolvedValue(undefined),
    };
    const tenantContext = { run: jest.fn((_user, callback) => callback()) };
    const eventEmitter = { emit: jest.fn() };
    const processor = new EmailQueueProcessor(
      emailProvider as any,
      executionRepo as any,
      tenantContext as any,
      eventEmitter as any,
    );

    await processor.process(buildJob());

    expect(emailProvider.send).not.toHaveBeenCalled();
    expect(executionRepo.updateSendResult).not.toHaveBeenCalled();
  });

  it('records FAILED only after the final retry', async () => {
    const executionRepo = {
      updateSendResult: jest.fn().mockResolvedValue(undefined),
    };
    const processor = new EmailQueueProcessor(
      { send: jest.fn() } as any,
      executionRepo as any,
      { run: jest.fn((_user, callback) => callback()) } as any,
      { emit: jest.fn() } as any,
    );

    await processor.onFailed(buildJob(2, 3));
    expect(executionRepo.updateSendResult).not.toHaveBeenCalled();

    await processor.onFailed(buildJob(3, 3));
    expect(executionRepo.updateSendResult).toHaveBeenCalledWith(
      'exec-1',
      'FAILED',
      null,
    );
  });
});
