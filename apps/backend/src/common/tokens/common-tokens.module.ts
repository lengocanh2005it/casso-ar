import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReminderExecutionOrmEntity } from '../../modules/reminders/infrastructure/reminder-execution.orm-entity';
import { TypeOrmReminderExecutionRepository } from '../../modules/reminders/infrastructure/typeorm-reminder-execution.repository';
import { REMINDER_EXECUTION_REPOSITORY } from './reminder-execution.token';

@Module({
  imports: [TypeOrmModule.forFeature([ReminderExecutionOrmEntity])],
  providers: [
    {
      provide: REMINDER_EXECUTION_REPOSITORY,
      useClass: TypeOrmReminderExecutionRepository,
    },
  ],
  exports: [REMINDER_EXECUTION_REPOSITORY],
})
export class CommonTokensModule {}
