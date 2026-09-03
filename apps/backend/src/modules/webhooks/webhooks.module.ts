import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AIProviderModule } from '../../common/ai/ai-provider.module';
import { BankAccountsModule } from '../bank-accounts/bank-accounts.module';
import { BankConnectionsModule } from '../bank-connections/bank-connections.module';
import { CustomersModule } from '../customers/customers.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { PaymentsModule } from '../payments/payments.module';
import { ReceivablesModule } from '../receivables/receivables.module';
import { BANK_TRANSACTION_REPOSITORY } from './application/bank-transaction-repository.port';
import { AI_MATCHING_GUARD } from './application/ai-matching-guard.port';
import { ListWebhookInboxUseCase } from './application/list-webhook-inbox.usecase';
import { MATCHING_CANDIDATE_REPOSITORY } from './application/matching-candidate-repository.port';
import { MatchingEngineService } from './application/matching-engine.service';
import { ProcessWebhookUseCase } from './application/process-webhook.usecase';
import { ReceiveWebhookUseCase } from './application/receive-webhook.usecase';
import { ReprocessWebhookUseCase } from './application/reprocess-webhook.usecase';
import { WEBHOOK_INBOX_REPOSITORY } from './application/webhook-inbox-repository.port';
import { WEBHOOK_JOB_QUEUE } from './application/webhook-job-queue.port';
import { BankTransactionOrmEntity } from './infrastructure/bank-transaction.orm-entity';
import { BullMqWebhookJobQueue } from './infrastructure/bullmq-webhook-job-queue.adapter';
import { MatchingCandidateOrmEntity } from './infrastructure/matching-candidate.orm-entity';
import { RedisAiMatchingGuard } from './infrastructure/redis-ai-matching-guard';
import { TypeOrmBankTransactionRepository } from './infrastructure/typeorm-bank-transaction.repository';
import { TypeOrmMatchingCandidateRepository } from './infrastructure/typeorm-matching-candidate.repository';
import { TypeOrmWebhookInboxRepository } from './infrastructure/typeorm-webhook-inbox.repository';
import { WebhookProcessor } from './infrastructure/webhook.processor';
import { WebhookInboxOrmEntity } from './infrastructure/webhook-inbox.orm-entity';
import { WEBHOOK_PROCESSING_QUEUE } from './infrastructure/webhooks-queue.constants';
import { WebhookInboxController } from './presentation/webhook-inbox.controller';
import { WebhookRateLimitGuard } from './presentation/webhook-rate-limit.guard';
import { WebhooksController } from './presentation/webhooks.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WebhookInboxOrmEntity,
      BankTransactionOrmEntity,
      MatchingCandidateOrmEntity,
    ]),
    BullModule.registerQueue({ name: WEBHOOK_PROCESSING_QUEUE }),
    AIProviderModule,
    BankConnectionsModule,
    BankAccountsModule,
    CustomersModule,
    InvoicesModule,
    ReceivablesModule,
    PaymentsModule,
  ],
  controllers: [WebhooksController, WebhookInboxController],
  providers: [
    {
      provide: WEBHOOK_INBOX_REPOSITORY,
      useClass: TypeOrmWebhookInboxRepository,
    },
    {
      provide: BANK_TRANSACTION_REPOSITORY,
      useClass: TypeOrmBankTransactionRepository,
    },
    {
      provide: MATCHING_CANDIDATE_REPOSITORY,
      useClass: TypeOrmMatchingCandidateRepository,
    },
    { provide: WEBHOOK_JOB_QUEUE, useClass: BullMqWebhookJobQueue },
    { provide: AI_MATCHING_GUARD, useClass: RedisAiMatchingGuard },
    MatchingEngineService,
    ProcessWebhookUseCase,
    ReceiveWebhookUseCase,
    ListWebhookInboxUseCase,
    ReprocessWebhookUseCase,
    WebhookProcessor,
    WebhookRateLimitGuard,
  ],
  exports: [
    WEBHOOK_INBOX_REPOSITORY,
    BANK_TRANSACTION_REPOSITORY,
    MATCHING_CANDIDATE_REPOSITORY,
    AI_MATCHING_GUARD,
    WebhookRateLimitGuard,
  ],
})
export class WebhooksModule {}
