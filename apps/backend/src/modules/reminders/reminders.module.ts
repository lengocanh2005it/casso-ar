import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { REMINDER_EXECUTION_REPOSITORY } from '../../common/tokens/reminder-execution.token';
import { ReminderPolicyService } from './application/reminder-policy.service';
import { ReminderExecutionOrmEntity } from './infrastructure/reminder-execution.orm-entity';
import { ReminderPolicyOrmEntity } from './infrastructure/reminder-policy.orm-entity';
import { ReminderRuleOrmEntity } from './infrastructure/reminder-rule.orm-entity';
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
  ],
  controllers: [RemindersController],
  providers: [
    {
      provide: REMINDER_EXECUTION_REPOSITORY,
      useClass: TypeOrmReminderExecutionRepository,
    },
    TypeOrmReminderPolicyRepository,
    TypeOrmReminderRuleRepository,
    TypeOrmReminderCandidateReader,
    ReminderPolicyService,
  ],
  exports: [
    REMINDER_EXECUTION_REPOSITORY,
    TypeOrmReminderPolicyRepository,
    TypeOrmReminderRuleRepository,
    TypeOrmReminderCandidateReader,
  ],
})
export class RemindersModule {}
