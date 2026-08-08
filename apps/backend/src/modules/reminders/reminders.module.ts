import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { REMINDER_EXECUTION_REPOSITORY } from '../../common/tokens/reminder-execution.token';
import { EmailService } from '../notifications/application/email.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { I_EMAIL_SERVICE } from './application/i-email-service.port';
import { ReminderPolicyService } from './application/reminder-policy.service';
import {
  REMINDER_SEND_QUEUE,
  ReminderSchedulerService,
} from './application/reminder-scheduler.service';
import { ReminderSenderService } from './application/reminder-sender.service';
import { ReminderExecutionListener } from './infrastructure/reminder-execution.listener';
import { ReminderExecutionOrmEntity } from './infrastructure/reminder-execution.orm-entity';
import { ReminderPolicyOrmEntity } from './infrastructure/reminder-policy.orm-entity';
import { ReminderRuleOrmEntity } from './infrastructure/reminder-rule.orm-entity';
import { ReminderSendProcessor } from './infrastructure/reminder-send.processor';
import { TypeOrmReminderCandidateReader } from './infrastructure/typeorm-reminder-candidate.reader';
import { TypeOrmReminderExecutionRepository } from './infrastructure/typeorm-reminder-execution.repository';
import { TypeOrmReminderPolicyRepository } from './infrastructure/typeorm-reminder-policy.repository';
import { TypeOrmReminderRuleRepository } from './infrastructure/typeorm-reminder-rule.repository';
import { RemindersController } from './presentation/reminders.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ReminderExecutionOrmEntity,
      ReminderPolicyOrmEntity,
      ReminderRuleOrmEntity,
    ]),
    BullModule.registerQueue({ name: REMINDER_SEND_QUEUE }),
    NotificationsModule,
  ],
  controllers: [RemindersController],
  providers: [
    {
      provide: REMINDER_EXECUTION_REPOSITORY,
      useClass: TypeOrmReminderExecutionRepository,
    },
    { provide: I_EMAIL_SERVICE, useExisting: EmailService },
    TypeOrmReminderPolicyRepository,
    TypeOrmReminderRuleRepository,
    TypeOrmReminderCandidateReader,
    ReminderPolicyService,
    ReminderSenderService,
    ReminderSchedulerService,
    ReminderSendProcessor,
    ReminderExecutionListener,
  ],
  exports: [
    REMINDER_EXECUTION_REPOSITORY,
    TypeOrmReminderPolicyRepository,
    TypeOrmReminderRuleRepository,
    TypeOrmReminderCandidateReader,
  ],
})
export class RemindersModule {}
