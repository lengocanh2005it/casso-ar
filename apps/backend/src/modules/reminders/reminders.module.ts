import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EVENT_PUBLISHER } from '../../common/events/event-publisher.port';
import { NestEventPublisherAdapter } from '../../common/events/nest-event-publisher.adapter';
import { CommonTokensModule } from '../../common/tokens/common-tokens.module';
import { CustomersModule } from '../customers/customers.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { EmailService } from '../notifications/application/email.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ReceivablesModule } from '../receivables/receivables.module';
import { CreateReminderPolicyUseCase } from './application/create-reminder-policy.usecase';
import { I_EMAIL_SERVICE } from './application/i-email-service.port';
import { ListReminderExecutionsUseCase } from './application/list-reminder-executions.usecase';
import { ListReminderPoliciesUseCase } from './application/list-reminder-policies.usecase';
import {
  REMINDER_SEND_QUEUE,
  ReminderSchedulerService,
} from './application/reminder-scheduler.service';
import { ReminderSenderService } from './application/reminder-sender.service';
import { UpdateReminderPolicyUseCase } from './application/update-reminder-policy.usecase';
import { ReminderExecutionListener } from './infrastructure/reminder-execution.listener';
import { ReminderPolicyOrmEntity } from './infrastructure/reminder-policy.orm-entity';
import { ReminderRuleOrmEntity } from './infrastructure/reminder-rule.orm-entity';
import { ReminderSendProcessor } from './infrastructure/reminder-send.processor';
import { TypeOrmReminderCandidateReader } from './infrastructure/typeorm-reminder-candidate.reader';
import { TypeOrmReminderPolicyRepository } from './infrastructure/typeorm-reminder-policy.repository';
import { TypeOrmReminderRuleRepository } from './infrastructure/typeorm-reminder-rule.repository';
import {
  ReminderExecutionsController,
  RemindersController,
} from './presentation/reminders.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([ReminderPolicyOrmEntity, ReminderRuleOrmEntity]),
    BullModule.registerQueue({ name: REMINDER_SEND_QUEUE }),
    CommonTokensModule,
    NotificationsModule,
    OrganizationsModule,
    CustomersModule,
    InvoicesModule,
    ReceivablesModule,
  ],
  controllers: [RemindersController, ReminderExecutionsController],
  providers: [
    { provide: I_EMAIL_SERVICE, useExisting: EmailService },
    { provide: EVENT_PUBLISHER, useClass: NestEventPublisherAdapter },
    {
      provide: 'IReminderPolicyRepository',
      useClass: TypeOrmReminderPolicyRepository,
    },
    {
      provide: 'IReminderRuleRepository',
      useClass: TypeOrmReminderRuleRepository,
    },
    {
      provide: 'IReminderCandidateReader',
      useClass: TypeOrmReminderCandidateReader,
    },
    CreateReminderPolicyUseCase,
    ListReminderPoliciesUseCase,
    UpdateReminderPolicyUseCase,
    ListReminderExecutionsUseCase,
    ReminderSenderService,
    ReminderSchedulerService,
    ReminderSendProcessor,
    ReminderExecutionListener,
  ],
  exports: [
    'IReminderPolicyRepository',
    'IReminderRuleRepository',
    'IReminderCandidateReader',
  ],
})
export class RemindersModule {}
