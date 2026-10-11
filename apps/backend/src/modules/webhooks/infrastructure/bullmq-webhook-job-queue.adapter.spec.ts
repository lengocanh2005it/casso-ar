import { BullMqWebhookJobQueue } from './bullmq-webhook-job-queue.adapter';

describe('BullMqWebhookJobQueue', () => {
  const input = {
    webhookInboxId: 'inbox-1',
    organizationId: 'org-1',
    jobId: 'webhook-reprocess-inbox-1',
  };

  it('schedules an attempt deduplicated on a deterministic key', async () => {
    const added: Array<{
      name: string;
      data: unknown;
      opts: Record<string, unknown>;
    }> = [];
    const queue = {
      // BullMQ resolves the add with the id it actually stored.
      add: jest.fn((name: string, data: unknown, opts: { jobId: string }) => {
        added.push({ name, data, opts });
        return Promise.resolve({ id: opts.jobId });
      }),
    };
    const jobQueue = new BullMqWebhookJobQueue(queue as never);

    await expect(jobQueue.enqueue(input)).resolves.toBe('enqueued');

    const [call] = added;
    expect(call.name).toBe('process-webhook');
    expect(call.data).toEqual({
      webhookInboxId: 'inbox-1',
      organizationId: 'org-1',
    });
    // The deterministic key is what an in-flight attempt holds, while the actual
    // job id is attempt-specific so a finished job never blocks a re-enqueue.
    expect(call.opts.deduplication).toEqual({
      id: 'webhook-reprocess-inbox-1',
    });
    expect(call.opts.jobId).toMatch(/^webhook-reprocess-inbox-1-/);
    expect(call.opts.jobId).not.toBe('webhook-reprocess-inbox-1');
    expect(call.opts.attempts).toBe(5);
    expect(call.opts.backoff).toEqual({
      type: 'exponential',
      delay: 5_000,
    });
    // An exhausted attempt must stay in the failed set (the dead-letter queue),
    // and a finished attempt must not occupy the deterministic key's job id.
    expect(call.opts).not.toHaveProperty('removeOnComplete');
    expect(call.opts).not.toHaveProperty('removeOnFail');
  });

  it('reports an attempt already in flight as deduplicated', async () => {
    const queue = {
      // A deduplicated add resolves with the in-flight job's id, not ours.
      add: jest
        .fn()
        .mockResolvedValue({ id: 'webhook-reprocess-inbox-1-other' }),
    };
    const jobQueue = new BullMqWebhookJobQueue(queue as never);

    await expect(jobQueue.enqueue(input)).resolves.toBe('deduped');
    expect(queue.add).toHaveBeenCalledTimes(1);
  });
});
