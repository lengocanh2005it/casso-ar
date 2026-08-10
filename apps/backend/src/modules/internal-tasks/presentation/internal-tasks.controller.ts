import { Permission } from '@casso-ledger/shared-types';
import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { CreateManualTaskUseCase } from '../application/create-manual-task.usecase';
import { DismissTaskUseCase } from '../application/dismiss-task.usecase';
import { ListReceivableTasksUseCase } from '../application/list-receivable-tasks.usecase';
import { ResolveTaskUseCase } from '../application/resolve-task.usecase';
import { CreateManualTaskDto } from './dto/create-manual-task.dto';
import { toInternalTaskResponse } from './dto/internal-task-response.dto';

@Controller()
@UseGuards(PermissionGuard)
export class InternalTasksController {
  constructor(
    private readonly listReceivableTasksUseCase: ListReceivableTasksUseCase,
    private readonly createManualTaskUseCase: CreateManualTaskUseCase,
    private readonly resolveTaskUseCase: ResolveTaskUseCase,
    private readonly dismissTaskUseCase: DismissTaskUseCase,
    private readonly tenantContext: TenantContextService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Get('receivables/:id/tasks')
  @RequirePermission(Permission.RECEIVABLE_READ)
  async list(
    @Param('id') receivableId: string,
    @Query() pagination: PaginationDto,
  ) {
    const result = await this.listReceivableTasksUseCase.execute(
      receivableId,
      pagination.page,
      pagination.limit,
    );
    return {
      items: result.items.map(toInternalTaskResponse),
      total: result.total,
      page: pagination.page,
      limit: pagination.limit,
    };
  }

  @Post('receivables/:id/tasks')
  @RequirePermission(Permission.INTERNAL_TASK_MANAGE)
  async createManualTask(
    @Param('id') receivableId: string,
    @Body() dto: CreateManualTaskDto,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    const currentUser = this.getCurrentUser();
    return this.idempotency.execute(
      `POST /receivables/${receivableId}/tasks`,
      key,
      { receivableId, ...dto },
      async () =>
        toInternalTaskResponse(
          await this.createManualTaskUseCase.execute({
            receivableId,
            assignedToUserId: dto.assignedToUserId,
            title: dto.title,
            description: dto.description ?? null,
            dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
            createdByUserId: currentUser.userId,
          }),
        ),
    );
  }

  @Post('tasks/:id/resolve')
  @RequirePermission(Permission.INTERNAL_TASK_MANAGE)
  async resolve(
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    const currentUser = this.getCurrentUser();
    return this.idempotency.execute(
      `POST /tasks/${id}/resolve`,
      key,
      { id },
      async () =>
        toInternalTaskResponse(
          await this.resolveTaskUseCase.execute(id, {
            userId: currentUser.userId,
            role: currentUser.role,
          }),
        ),
    );
  }

  @Post('tasks/:id/dismiss')
  @RequirePermission(Permission.INTERNAL_TASK_MANAGE)
  async dismiss(
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    const currentUser = this.getCurrentUser();
    return this.idempotency.execute(
      `POST /tasks/${id}/dismiss`,
      key,
      { id },
      async () =>
        toInternalTaskResponse(
          await this.dismissTaskUseCase.execute(id, {
            userId: currentUser.userId,
            role: currentUser.role,
          }),
        ),
    );
  }

  private getCurrentUser() {
    const user = this.tenantContext.getCurrentUser();
    if (!user) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Yêu cầu đăng nhập.');
    }
    return user;
  }
}
