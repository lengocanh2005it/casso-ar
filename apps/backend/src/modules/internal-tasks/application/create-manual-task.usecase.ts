import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import {
  type IMembershipRepository,
  MEMBERSHIP_REPOSITORY,
} from '../../organizations/application/membership-repository.port';
import {
  type IReceivableRepository,
  RECEIVABLE_REPOSITORY,
} from '../../receivables/application/receivable-repository.port';
import { InternalTask } from '../domain/internal-task';
import {
  type IInternalTaskRepository,
  INTERNAL_TASK_REPOSITORY,
} from './internal-task-repository.port';

export interface CreateManualTaskInput {
  receivableId: string;
  assignedToUserId?: string;
  title: string;
  description: string | null;
  dueDate?: Date | null;
  createdByUserId: string;
}

@Injectable()
export class CreateManualTaskUseCase {
  constructor(
    @Inject(INTERNAL_TASK_REPOSITORY)
    private readonly internalTaskRepo: IInternalTaskRepository,
    @Inject(RECEIVABLE_REPOSITORY)
    private readonly receivableRepo: IReceivableRepository,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: IMembershipRepository,
    private readonly tenantContext: TenantContextService,
    private readonly dataSource: DataSource,
  ) {}

  async execute(input: CreateManualTaskInput): Promise<InternalTask> {
    const organizationId = this.tenantContext.getOrganizationId();
    const receivable = await this.receivableRepo.findById(input.receivableId);
    if (!receivable) {
      throw new AppError(
        ErrorCode.RECEIVABLE_NOT_FOUND,
        'Không tìm thấy khoản phải thu.',
      );
    }
    if (receivable.organizationId !== organizationId) {
      throw new AppError(
        ErrorCode.TENANT_MISMATCH,
        'Khoản phải thu không thuộc tổ chức hiện tại.',
      );
    }

    const assignedToUserId = input.assignedToUserId ?? input.createdByUserId;
    const membership = await this.membershipRepo.findByUserAndOrganization(
      assignedToUserId,
      organizationId,
    );
    if (!membership?.isActive()) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'Người được giao việc không thuộc tổ chức này.',
      );
    }

    const task = new InternalTask({
      id: randomUUID(),
      organizationId,
      receivableId: input.receivableId,
      assignedToUserId,
      createdByUserId: input.createdByUserId,
      taskType: 'MANUAL',
      title: input.title,
      description: input.description,
      dueDate: input.dueDate ?? null,
      status: 'OPEN',
      createdAt: new Date(),
      resolvedAt: null,
      version: 1,
    });

    await this.dataSource.transaction((manager) =>
      this.internalTaskRepo.save(task, manager),
    );
    return task;
  }
}
