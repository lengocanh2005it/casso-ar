import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  let metrics: MetricsService;
  let fakeWebhookQueue: {
    getWaitingCount: jest.Mock;
    getActiveCount: jest.Mock;
  };
  let fakeEmailQueue: {
    getWaitingCount: jest.Mock;
    getActiveCount: jest.Mock;
  };

  beforeEach(() => {
    fakeWebhookQueue = {
      getWaitingCount: jest.fn().mockResolvedValue(3),
      getActiveCount: jest.fn().mockResolvedValue(1),
    };
    fakeEmailQueue = {
      getWaitingCount: jest.fn().mockResolvedValue(2),
      getActiveCount: jest.fn().mockResolvedValue(1),
    };
    metrics = new MetricsService(
      fakeWebhookQueue as never,
      fakeEmailQueue as never,
    );
    metrics.onModuleInit();
  });

  it('exposes http_request_duration_seconds after an observation', async () => {
    metrics.observeHttpRequest('GET', '/health', 200, 0.05);
    const text = await metrics.getMetricsText();
    expect(text).toContain('# HELP http_request_duration_seconds');
    expect(text).toContain('http_request_duration_seconds_bucket');
  });

  it('exposes webhook_processing_duration_seconds after an observation', async () => {
    metrics.observeWebhookProcessing(1.2);
    const text = await metrics.getMetricsText();
    expect(text).toContain('# HELP webhook_processing_duration_seconds');
  });

  it('exposes bullmq_job_failed_total incremented per queue', async () => {
    metrics.incrementBullmqJobFailed('webhook-processing');
    metrics.incrementBullmqJobFailed('email-queue');
    const text = await metrics.getMetricsText();
    expect(text).toContain(
      'bullmq_job_failed_total{queue="webhook-processing"} 1',
    );
    expect(text).toContain('bullmq_job_failed_total{queue="email-queue"} 1');
  });

  it('exposes bullmq_queue_backlog_size computed from the queue at scrape time', async () => {
    const text = await metrics.getMetricsText();
    expect(text).toContain('# HELP bullmq_queue_backlog_size');
    expect(text).toContain(
      'bullmq_queue_backlog_size{queue="webhook-processing"} 4',
    );
    expect(text).toContain('bullmq_queue_backlog_size{queue="email-queue"} 3');
  });
});
