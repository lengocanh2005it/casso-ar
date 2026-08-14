import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonTokensModule } from '../../common/tokens/common-tokens.module';
import { BillingModule } from '../billing/billing.module';
import { CollectionActivityModule } from '../collection-activity/collection-activity.module';
import { CustomersModule } from '../customers/customers.module';
import { EmailTemplatesModule } from '../email-templates/email-templates.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { ReceivablesModule } from '../receivables/receivables.module';
import { RemindersModule } from '../reminders/reminders.module';
import { AI_CHAT_PROVIDER } from './application/ai-chat-provider.port';
import { AI_USAGE_LOG_REPOSITORY } from './application/ai-usage-log-repository.port';
import { CancelPendingActionUseCase } from './application/cancel-pending-action.usecase';
import { ConfirmPendingActionUseCase } from './application/confirm-pending-action.usecase';
import { COPILOT_CONVERSATION_REPOSITORY } from './application/conversation-repository.port';
import { CopilotChatUseCase } from './application/copilot-chat.usecase';
import { CopilotToolRegistry } from './application/copilot-tool-registry';
import { DeleteCopilotDraftUseCase } from './application/delete-copilot-draft.usecase';
import { COPILOT_DRAFT_REPOSITORY } from './application/draft-repository.port';
import { GetCopilotUsageUseCase } from './application/get-copilot-usage.usecase';
import { ListCopilotDraftsUseCase } from './application/list-copilot-drafts.usecase';
import { COPILOT_PENDING_ACTION_REPOSITORY } from './application/pending-action-repository.port';
import { ReopenCopilotDraftUseCase } from './application/reopen-copilot-draft.usecase';
import { DraftReminderEmailTool } from './application/tools/draft-reminder-email.tool';
import { GetCollectionActivityTimelineTool } from './application/tools/get-collection-activity-timeline.tool';
import { GetPaymentHistoryTool } from './application/tools/get-payment-history.tool';
import { GetReceivableSummaryTool } from './application/tools/get-receivable-summary.tool';
import { SendReminderEmailTool } from './application/tools/send-reminder-email.tool';
import { UpdateCopilotDraftUseCase } from './application/update-copilot-draft.usecase';
import { AIUsageLogOrmEntity } from './infrastructure/ai-usage-log.orm-entity';
import { CopilotConversationOrmEntity } from './infrastructure/copilot-conversation.orm-entity';
import { CopilotDraftOrmEntity } from './infrastructure/copilot-draft.orm-entity';
import { CopilotMessageOrmEntity } from './infrastructure/copilot-message.orm-entity';
import { CopilotPendingActionOrmEntity } from './infrastructure/copilot-pending-action.orm-entity';
import { OpenAiChatProviderAdapter } from './infrastructure/openai-chat-provider.adapter';
import { TypeOrmAIUsageLogRepository } from './infrastructure/typeorm-ai-usage-log.repository';
import { TypeOrmCopilotConversationRepository } from './infrastructure/typeorm-copilot-conversation.repository';
import { TypeOrmCopilotDraftRepository } from './infrastructure/typeorm-copilot-draft.repository';
import { TypeOrmCopilotPendingActionRepository } from './infrastructure/typeorm-copilot-pending-action.repository';
import { CopilotController } from './presentation/copilot.controller';

function copilotToolRegistryFactory(): CopilotToolRegistry {
  const registry = new CopilotToolRegistry();
  registry.register({
    name: GetReceivableSummaryTool.NAME,
    description: 'Summarize a customer receivable using structured data.',
    inputSchema: {
      type: 'object',
      properties: { customerId: { type: 'string' } },
      required: ['customerId'],
    },
    requiresReminderPermission: false,
  });
  registry.register({
    name: GetCollectionActivityTimelineTool.NAME,
    description: "A customer's collection activity history.",
    inputSchema: {
      type: 'object',
      properties: {
        customerId: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 50 },
      },
      required: ['customerId'],
    },
    requiresReminderPermission: false,
  });
  registry.register({
    name: GetPaymentHistoryTool.NAME,
    description: "A customer's payment history.",
    inputSchema: {
      type: 'object',
      properties: {
        customerId: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 50 },
      },
      required: ['customerId'],
    },
    requiresReminderPermission: false,
  });
  registry.register({
    name: DraftReminderEmailTool.NAME,
    description: 'Create a reminder email draft without sending it.',
    inputSchema: {
      type: 'object',
      properties: {
        receivableId: { type: 'string' },
        tone: { type: 'string', enum: ['polite', 'urgent'] },
      },
      required: ['receivableId'],
    },
    requiresReminderPermission: true,
  });
  registry.register({
    name: SendReminderEmailTool.NAME,
    description: 'Propose sending an existing reminder draft for confirmation.',
    inputSchema: {
      type: 'object',
      properties: {
        draftId: { type: 'string' },
        receivableId: { type: 'string' },
      },
      required: ['draftId', 'receivableId'],
    },
    requiresReminderPermission: true,
  });
  return registry;
}

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CopilotConversationOrmEntity,
      CopilotMessageOrmEntity,
      CopilotPendingActionOrmEntity,
      CopilotDraftOrmEntity,
      AIUsageLogOrmEntity,
    ]),
    CommonTokensModule,
    ReceivablesModule,
    CustomersModule,
    CollectionActivityModule,
    PaymentsModule,
    NotificationsModule,
    EmailTemplatesModule,
    RemindersModule,
    BillingModule,
  ],
  controllers: [CopilotController],
  providers: [
    {
      provide: COPILOT_CONVERSATION_REPOSITORY,
      useClass: TypeOrmCopilotConversationRepository,
    },
    {
      provide: COPILOT_PENDING_ACTION_REPOSITORY,
      useClass: TypeOrmCopilotPendingActionRepository,
    },
    {
      provide: COPILOT_DRAFT_REPOSITORY,
      useClass: TypeOrmCopilotDraftRepository,
    },
    { provide: AI_USAGE_LOG_REPOSITORY, useClass: TypeOrmAIUsageLogRepository },
    { provide: AI_CHAT_PROVIDER, useClass: OpenAiChatProviderAdapter },
    { provide: CopilotToolRegistry, useFactory: copilotToolRegistryFactory },
    GetReceivableSummaryTool,
    GetCollectionActivityTimelineTool,
    GetPaymentHistoryTool,
    DraftReminderEmailTool,
    SendReminderEmailTool,
    CopilotChatUseCase,
    ConfirmPendingActionUseCase,
    CancelPendingActionUseCase,
    GetCopilotUsageUseCase,
    ListCopilotDraftsUseCase,
    ReopenCopilotDraftUseCase,
    UpdateCopilotDraftUseCase,
    DeleteCopilotDraftUseCase,
  ],
  exports: [AI_USAGE_LOG_REPOSITORY],
})
export class CopilotModule {}
