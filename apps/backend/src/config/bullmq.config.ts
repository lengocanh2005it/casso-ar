import type { ConfigService } from '@nestjs/config';
import type { QueueOptions } from 'bullmq';

export function getBullMqConfig(
  config: ConfigService,
): Pick<QueueOptions, 'connection'> {
  const maxRetries = Number(config.get<string>('REDIS_MAX_RETRIES', '5'));
  const connectTimeout = Number(
    config.get<string>('REDIS_CONNECT_TIMEOUT', '5000'),
  );

  return {
    connection: {
      host: config.get<string>('REDIS_HOST', 'localhost'),
      port: Number(config.get<string>('REDIS_PORT', '6379')),
      connectTimeout,
      retryStrategy(times: number) {
        if (times > maxRetries) {
          return undefined;
        }
        return Math.min(times * 200, 2000);
      },
    },
  };
}
