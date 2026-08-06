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
    const processor = new WebhookProcessor(processWebhook as any);

    await processor.process(buildJob(1, 5));

    expect(processWebhook.execute).toHaveBeenCalledWith('wh-1', 'org-1');
  });

  it('logs the dead-letter transition only after the final retry attempt', () => {
    const processWebhook = { execute: jest.fn() };
    const processor = new WebhookProcessor(processWebhook as any);
    const errorSpy = jest.spyOn((processor as any).logger, 'error');

    processor.onFailed(buildJob(3, 5));
    expect(errorSpy).not.toHaveBeenCalled();

    processor.onFailed(buildJob(5, 5));
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('moved to dead letter'),
    );
  });
});
