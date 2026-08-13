import { Module } from '@nestjs/common';
import { AlertsModule } from '../../modules/alerts/alerts.module';
import { CollectionActivityModule } from '../../modules/collection-activity/collection-activity.module';
import { CopilotModule } from '../../modules/copilot/copilot.module';
import { WebhooksModule } from '../../modules/webhooks/webhooks.module';
import { CommonTokensModule } from '../tokens/common-tokens.module';
import { RetentionSchedulerService } from './retention-scheduler.service';

@Module({
  imports: [
    CommonTokensModule,
    CopilotModule,
    CollectionActivityModule,
    WebhooksModule,
    AlertsModule,
  ],
  providers: [RetentionSchedulerService],
})
export class RetentionModule {}
