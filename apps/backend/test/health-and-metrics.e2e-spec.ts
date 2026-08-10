import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';

describe('Health and metrics (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.DB_HOST = 'localhost';
    process.env.DB_PORT = '5432';
    process.env.DB_USERNAME = 'casso';
    process.env.DB_PASSWORD = 'casso';
    process.env.DB_DATABASE = 'casso_ledger';
    process.env.REDIS_HOST = 'localhost';
    process.env.REDIS_PORT = '6379';
    process.env.JWT_SECRET = 'e2e-jwt-secret';
    process.env.ACCESS_TOKEN_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.RESEND_API_KEY = 'e2e-resend-key';
    process.env.CASSO_WEBHOOK_CLIENT_ID = 'e2e-client';
    process.env.CASSO_WEBHOOK_SECRET_KEY = 'e2e-secret';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  }, 30_000);

  afterAll(async () => {
    await app?.close();
  });

  it('GET /health returns 200 with status ok and all checks true when dependencies are up', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);

    expect(response.body).toEqual({
      status: 'ok',
      checks: { postgres: true, redis: true, bullmq: true },
    });
  });

  it('GET /metrics returns Prometheus text format including required metrics and both BullMQ queues', async () => {
    const response = await request(app.getHttpServer())
      .get('/metrics')
      .expect(200);

    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.text).toContain('# HELP http_request_duration_seconds');
    expect(response.text).toContain(
      '# HELP webhook_processing_duration_seconds',
    );
    expect(response.text).toContain('# HELP bullmq_job_failed_total');
    expect(response.text).toContain('# HELP bullmq_queue_backlog_size');
    expect(response.text).toContain(
      'bullmq_queue_backlog_size{queue="webhook-processing"}',
    );
    expect(response.text).toContain(
      'bullmq_queue_backlog_size{queue="email-queue"}',
    );
  });
});
