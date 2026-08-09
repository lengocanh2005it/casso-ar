import { Inject, Injectable } from '@nestjs/common';
import { InternalTask } from '../domain/internal-task';
import {
  type IInternalTaskRepository,
  INTERNAL_TASK_REPOSITORY,
} from './internal-task-repository.port';

@Injectable()
export class ListReceivableTasksUseCase {
  constructor(
    @Inject(INTERNAL_TASK_REPOSITORY)
    private readonly internalTaskRepo: IInternalTaskRepository,
  ) {}

  execute(
    receivableId: string,
    page: number,
    limit: number,
  ): Promise<{ items: InternalTask[]; total: number }> {
    return this.internalTaskRepo.findPageByReceivableId(
      receivableId,
      page,
      limit,
    );
  }
}
