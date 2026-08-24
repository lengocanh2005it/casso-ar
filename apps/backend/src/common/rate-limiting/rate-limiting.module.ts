import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RATE_LIMIT_REDIS_CLIENT } from './rate-limit-redis-client.provider';

@Global()
@Module({
  providers: [
    {
      provide: RATE_LIMIT_REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Redis({
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: Number(config.get<string>('REDIS_PORT', '6379')),
        }),
    },
  ],
  exports: [RATE_LIMIT_REDIS_CLIENT],
})
export class RateLimitingModule {}
