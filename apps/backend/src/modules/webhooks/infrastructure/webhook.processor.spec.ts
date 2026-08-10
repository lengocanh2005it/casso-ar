import { WebhookProcessor } from './webhook.processor';

function buildJob(attemptsMade: number, attempts: number) {
  return {
    id: 'wh-1',
    data: { webhookInboxId: 'wh-1', organizationId: 'org-1' },
    attemptsMade,
    opts: { attempts },
  } as any;
}

describe('WebhookProcessor', () => {
  it('processes a job via ProcessWebhookUseCase', async () => {
    const processWebhook = { execute: jest.fn().mockResolvedValue(undefined) };
    const metrics = {
      observeWebhookProcessing: jest.fn(),
      incrementBullmqJobFailed: jest.fn(),
    };
    const requestIdStore = {
      run: jest.fn((_requestId, callback) => callback()),
    };
    const processor = new WebhookProcessor(
      processWebhook as any,
      metrics as any,
      requestIdStore as any,
    );

    await processor.process(buildJob(1, 5));

    expect(processWebhook.execute).toHaveBeenCalledWith('wh-1', 'org-1');
    expect(metrics.observeWebhookProcessing).toHaveBeenCalledWith(
      expect.any(Number),
    );
    expect(requestIdStore.run).toHaveBeenCalledWith(
      'bullmq:wh-1',
      expect.any(Function),
    );
  });

  it('logs the dead-letter transition only after the final retry attempt', () => {
    const processWebhook = { execute: jest.fn() };
    const metrics = {
      observeWebhookProcessing: jest.fn(),
      incrementBullmqJobFailed: jest.fn(),
    };
    const requestIdStore = {
      run: jest.fn((_requestId, callback) => callback()),
    };
    const processor = new WebhookProcessor(
      processWebhook as any,
      metrics as any,
      requestIdStore as any,
    );
    const errorSpy = jest.spyOn((processor as any).logger, 'error');

    processor.onFailed(buildJob(3, 5));
    expect(errorSpy).not.toHaveBeenCalled();
    expect(metrics.incrementBullmqJobFailed).toHaveBeenCalledWith(
      'webhook-processing',
    );

    processor.onFailed(buildJob(5, 5));
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('moved to dead letter'),
    );
    expect(metrics.incrementBullmqJobFailed).toHaveBeenCalledTimes(2);
    expect(requestIdStore.run).toHaveBeenCalledWith(
      'bullmq:wh-1',
      expect.any(Function),
    );
  });
});
