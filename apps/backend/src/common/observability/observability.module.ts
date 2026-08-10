import { BullModule } from '@nestjs/bullmq';
import {
  Global,
  type MiddlewareConsumer,
  Module,
  type NestModule,
} from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { EMAIL_QUEUE } from '../../modules/notifications/infrastructure/email-queue.constants';
import { WEBHOOK_PROCESSING_QUEUE } from '../../modules/webhooks/infrastructure/webhooks-queue.constants';
import { HealthController } from './health.controller';
import { HttpMetricsInterceptor } from './http-metrics.interceptor';
import { JsonLogger } from './json-logger.service';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { RequestIdMiddleware } from './request-id.middleware';
import { RequestIdStore } from './request-id.store';

@Global()
@Module({
  imports: [
    BullModule.registerQueue({ name: WEBHOOK_PROCESSING_QUEUE }),
    BullModule.registerQueue({ name: EMAIL_QUEUE }),
  ],
  controllers: [HealthController, MetricsController],
  providers: [
    RequestIdStore,
    JsonLogger,
    MetricsService,
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
  ],
  exports: [RequestIdStore, JsonLogger, MetricsService],
})
export class ObservabilityModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
