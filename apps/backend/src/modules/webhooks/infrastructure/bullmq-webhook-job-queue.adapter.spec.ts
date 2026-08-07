import { BullMqWebhookJobQueue } from './bullmq-webhook-job-queue.adapter';

describe('BullMqWebhookJobQueue', () => {
  it('enqueues a webhook job with its existing retry policy', async () => {
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    const jobQueue = new BullMqWebhookJobQueue(queue as any);

    await jobQueue.enqueue({
      webhookInboxId: 'inbox-1',
      organizationId: 'org-1',
      jobId: 'transaction-1',
    });

    expect(queue.add).toHaveBeenCalledWith(
      'process-webhook',
      { webhookInboxId: 'inbox-1', organizationId: 'org-1' },
      {
        jobId: 'transaction-1',
        attempts: 5,
        backoff: { type: 'exponential', delay: 5_000 },
      },
    );
  });
});
