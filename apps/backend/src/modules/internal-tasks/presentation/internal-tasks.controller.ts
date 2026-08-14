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
import {
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { ApiErrorResponse } from '../../../common/swagger/api-error-response.decorator';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { CreateManualTaskUseCase } from '../application/create-manual-task.usecase';
import { DismissTaskUseCase } from '../application/dismiss-task.usecase';
import { ListReceivableTasksUseCase } from '../application/list-receivable-tasks.usecase';
import { ResolveTaskUseCase } from '../application/resolve-task.usecase';
import { CreateManualTaskDto } from './dto/create-manual-task.dto';
import {
  InternalTaskResponseDto,
  ListInternalTasksResponseDto,
  toInternalTaskResponse,
} from './dto/internal-task-response.dto';

@ApiTags('internal-tasks')
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
  @ApiOperation({ summary: 'List internal tasks of a receivable' })
  @ApiOkResponse({ type: ListInternalTasksResponseDto })
  @ApiErrorResponse(ErrorCode.VALIDATION_ERROR)
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
  @ApiOperation({ summary: 'Create a manual internal task on a receivable' })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiCreatedResponse({ type: InternalTaskResponseDto })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.RECEIVABLE_NOT_FOUND,
    ErrorCode.TENANT_MISMATCH,
    ErrorCode.IDEMPOTENCY_KEY_REUSED,
  )
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
  @ApiOperation({ summary: 'Resolve an internal task' })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiCreatedResponse({ type: InternalTaskResponseDto })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.NOT_FOUND,
    ErrorCode.FORBIDDEN,
    ErrorCode.CONFLICT,
    ErrorCode.IDEMPOTENCY_KEY_REUSED,
  )
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
  @ApiOperation({ summary: 'Dismiss an internal task' })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiCreatedResponse({ type: InternalTaskResponseDto })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.NOT_FOUND,
    ErrorCode.FORBIDDEN,
    ErrorCode.CONFLICT,
    ErrorCode.IDEMPOTENCY_KEY_REUSED,
  )
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
