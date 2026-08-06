import type { ConfigService } from '@nestjs/config';
import type { QueueOptions } from 'bullmq';

export function getBullMqConfig(
  config: ConfigService,
): Pick<QueueOptions, 'connection'> {
  return {
    connection: {
      host: config.get<string>('REDIS_HOST', 'localhost'),
      port: Number(config.get<string>('REDIS_PORT', '6379')),
    },
  };
}
