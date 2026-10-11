import { BullMqWebhookJobQueue } from './bullmq-webhook-job-queue.adapter';

describe('BullMqWebhookJobQueue', () => {
  it('enqueues a webhook job with its existing retry policy', async () => {
    const queue = {
      getJob: jest.fn().mockResolvedValue(undefined),
      add: jest.fn().mockResolvedValue(undefined),
    };
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
        // A finished job must not keep its job id occupied: the deterministic
        // id is what makes the enqueue idempotent, and a retained completed or
        // failed job turns every later reprocess of the same inbox into a
        // silent no-op. #434
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  });

  it('reports the enqueue as scheduled', async () => {
    const queue = {
      getJob: jest.fn().mockResolvedValue(undefined),
      add: jest.fn().mockResolvedValue(undefined),
    };
    const jobQueue = new BullMqWebhookJobQueue(queue as any);

    await expect(
      jobQueue.enqueue({
        webhookInboxId: 'inbox-1',
        organizationId: 'org-1',
        jobId: 'transaction-1',
      }),
    ).resolves.toBe('enqueued');
  });

  it('reports an attempt already in flight as deduplicated instead of adding again', async () => {
    const queue = {
      getJob: jest.fn().mockResolvedValue({ id: 'transaction-1' }),
      add: jest.fn(),
    };
    const jobQueue = new BullMqWebhookJobQueue(queue as any);

    await expect(
      jobQueue.enqueue({
        webhookInboxId: 'inbox-1',
        organizationId: 'org-1',
        jobId: 'transaction-1',
      }),
    ).resolves.toBe('deduped');
    expect(queue.add).not.toHaveBeenCalled();
  });
});
