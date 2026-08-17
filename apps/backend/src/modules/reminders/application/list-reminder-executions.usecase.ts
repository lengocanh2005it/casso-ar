import { Inject, Injectable } from '@nestjs/common';
import { REMINDER_EXECUTION_REPOSITORY } from '../../../common/tokens/reminder-execution.token';
import type {
  ReminderExecution,
  ReminderExecutionStatus,
} from '../domain/reminder-execution';
import type { IReminderExecutionRepository } from './reminder-execution-repository.port';

export interface ListReminderExecutionsInput {
  receivableId?: string;
  status?: ReminderExecutionStatus;
  page: number;
  limit: number;
}

@Injectable()
export class ListReminderExecutionUseCase {
  constructor(
    @Inject(REMINDER_EXECUTION_REPOSITORY)
    private readonly executionRepo: IReminderExecutionRepository,
  ) {}

  execute(
    input: ListReminderExecutionsInput,
  ): Promise<{ items: ReminderExecution[]; total: number }> {
    return this.executionRepo.findPage(input);
  }
}
