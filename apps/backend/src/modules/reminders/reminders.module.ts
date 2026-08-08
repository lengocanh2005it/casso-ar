import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { REMINDER_EXECUTION_REPOSITORY } from '../../common/tokens/reminder-execution.token';
import { ReminderExecutionOrmEntity } from './infrastructure/reminder-execution.orm-entity';
import { TypeOrmReminderExecutionRepository } from './infrastructure/typeorm-reminder-execution.repository';

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
export class RemindersModule {}
