import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { Role } from '../../organizations/domain/membership';
import { InternalTask } from '../domain/internal-task';
import {
  type IInternalTaskRepository,
  INTERNAL_TASK_REPOSITORY,
} from './internal-task-repository.port';
import type { TaskActor } from './resolve-task.usecase';

@Injectable()
export class DismissTaskUseCase {
  constructor(
    @Inject(INTERNAL_TASK_REPOSITORY)
    private readonly internalTaskRepo: IInternalTaskRepository,
    private readonly dataSource: DataSource,
  ) {}

  async execute(taskId: string, actor: TaskActor): Promise<InternalTask> {
    return this.dataSource.transaction(async (manager) => {
      const task = await this.internalTaskRepo.findById(taskId, manager);
      if (!task) {
        throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy công việc.');
      }
      if (task.assignedToUserId !== actor.userId && actor.role !== Role.OWNER) {
        throw new AppError(
          ErrorCode.FORBIDDEN,
          'Chỉ người được giao việc hoặc chủ tổ chức mới có thể xử lý công việc này.',
        );
      }

      let dismissed: InternalTask;
      try {
        dismissed = task.dismiss();
      } catch (error) {
        throw new AppError(
          ErrorCode.CONFLICT,
          error instanceof Error ? error.message : 'Công việc không thể xử lý.',
        );
      }
      await this.internalTaskRepo.save(dismissed, manager);
      return dismissed;
    });
  }
}
