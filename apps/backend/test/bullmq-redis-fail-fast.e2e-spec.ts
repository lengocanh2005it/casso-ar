import { BullModule, getQueueToken } from '@nestjs/bullmq';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Queue } from 'bullmq';
import { getBullMqConfig } from '../src/config/bullmq.config';

jest.setTimeout(30_000);

describe('BullMQ Redis fail-fast (e2e)', () => {
  let app: INestApplication;
  let queue: Queue;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [
        BullModule.forRootAsync({
          useFactory: () =>
            getBullMqConfig({
              get: (key: string, defaultValue: unknown) => {
                if (key === 'REDIS_HOST') return '192.0.2.1'; // TEST-NET-1, unreachable
                if (key === 'REDIS_PORT') return '1';
                if (key === 'REDIS_MAX_RETRIES') return '2';
                if (key === 'REDIS_CONNECT_TIMEOUT') return '1000';
                return defaultValue;
              },
            } as never),
        }),
        BullModule.registerQueue({ name: 'test-fail-fast' }),
      ],
    }).compile();

    app = mod.createNestApplication();
    await app.init();
    queue = app.get<Queue>(getQueueToken('test-fail-fast'));
  });

  afterAll(async () => {
    await app?.close();
  });

  it('rejects queue.add() within bounded time when Redis is unreachable', async () => {
    const start = Date.now();

    await expect(queue.add('test-job', { data: 'test' })).rejects.toThrow();

    const elapsed = Date.now() - start;
    // Should fail within ~3s (2 retries * 1s connect timeout + overhead)
    // Definitely should NOT hang forever
    expect(elapsed).toBeLessThan(10_000);
  });
});
