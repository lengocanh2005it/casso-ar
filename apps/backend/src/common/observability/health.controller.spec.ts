import { HealthController } from './health.controller';

describe('HealthController', () => {
  function buildController(overrides: {
    postgresOk?: boolean;
    redisOk?: boolean;
    bullmqOk?: boolean;
  }) {
    const dataSource = {
      query:
        overrides.postgresOk === false
          ? jest.fn().mockRejectedValue(new Error('down'))
          : jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    };
    const client = {
      info:
        overrides.redisOk === false
          ? jest.fn().mockRejectedValue(new Error('down'))
          : jest.fn().mockResolvedValue('redis_version:7'),
    };
    const queue = {
      getBackend: () => ({ client: Promise.resolve(client) }),
      getJobCounts:
        overrides.bullmqOk === false
          ? jest.fn().mockRejectedValue(new Error('down'))
          : jest.fn().mockResolvedValue({ waiting: 0 }),
    };
    return new HealthController(dataSource as never, queue as never);
  }

  it('returns status ok and all checks true when everything is healthy', async () => {
    const controller = buildController({});
    const result = await controller.check();
    expect(result.body).toEqual({
      status: 'ok',
      checks: { postgres: true, redis: true, bullmq: true },
    });
    expect(result.httpStatus).toBe(200);
  });

  it('returns status degraded and 503 when postgres is down', async () => {
    const controller = buildController({ postgresOk: false });
    const result = await controller.check();
    expect(result.body.status).toBe('degraded');
    expect(result.body.checks.postgres).toBe(false);
    expect(result.httpStatus).toBe(503);
  });

  it('returns status degraded and 503 when redis is down', async () => {
    const controller = buildController({ redisOk: false });
    const result = await controller.check();
    expect(result.body.checks.redis).toBe(false);
    expect(result.httpStatus).toBe(503);
  });

  it('returns status degraded and 503 when bullmq is down', async () => {
    const controller = buildController({ bullmqOk: false });
    const result = await controller.check();
    expect(result.body.checks.bullmq).toBe(false);
    expect(result.httpStatus).toBe(503);
  });
});
