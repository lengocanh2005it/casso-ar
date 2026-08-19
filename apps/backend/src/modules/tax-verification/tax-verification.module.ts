import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { TAX_CODE_LOOKUP_ADAPTER } from './application/tax-code-lookup.port';
import { REDIS_CLIENT } from './infrastructure/redis-client.provider';
import { VietQrTaxCodeLookupAdapter } from './infrastructure/vietqr-tax-code-lookup.adapter';

@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Redis({
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: Number(config.get<string>('REDIS_PORT', '6379')),
        }),
    },
    {
      provide: TAX_CODE_LOOKUP_ADAPTER,
      useClass: VietQrTaxCodeLookupAdapter,
    },
  ],
  exports: [TAX_CODE_LOOKUP_ADAPTER],
})
export class TaxVerificationModule {}
