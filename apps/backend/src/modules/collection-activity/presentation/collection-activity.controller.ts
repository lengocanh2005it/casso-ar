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
import { GetCustomerTimelineUseCase } from '../application/get-customer-timeline.usecase';
import { GetReceivableTimelineUseCase } from '../application/get-receivable-timeline.usecase';
import { RecordManualActivityUseCase } from '../application/record-manual-activity.usecase';
import { toCollectionActivityResponse } from './dto/collection-activity-response.dto';
import { CreateManualActivityDto } from './dto/create-manual-activity.dto';

@Controller()
@UseGuards(PermissionGuard)
export class CollectionActivityController {
  constructor(
    private readonly recordManualActivityUseCase: RecordManualActivityUseCase,
    private readonly getReceivableTimelineUseCase: GetReceivableTimelineUseCase,
    private readonly getCustomerTimelineUseCase: GetCustomerTimelineUseCase,
    private readonly tenantContext: TenantContextService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post('receivables/:id/activities')
  @RequirePermission(Permission.RECEIVABLE_WRITE)
  async createManual(
    @Param('id') receivableId: string,
    @Body() dto: CreateManualActivityDto,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    const user = this.getCurrentUser();
    return this.idempotency.execute(
      `POST /receivables/${receivableId}/activities`,
      key,
      { receivableId, ...dto },
      async () =>
        toCollectionActivityResponse(
          await this.recordManualActivityUseCase.execute({
            receivableId,
            activityType: dto.activityType,
            description: dto.description,
            createdByUserId: user.userId,
          }),
        ),
    );
  }

  @Get('receivables/:id/timeline')
  @RequirePermission(Permission.RECEIVABLE_READ)
  async receivableTimeline(
    @Param('id') receivableId: string,
    @Query() pagination: PaginationDto,
  ) {
    const result = await this.getReceivableTimelineUseCase.execute(
      receivableId,
      pagination.page,
      pagination.limit,
    );
    return {
      items: result.items.map(toCollectionActivityResponse),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  @Get('customers/:id/timeline')
  @RequirePermission(Permission.RECEIVABLE_READ)
  async customerTimeline(
    @Param('id') customerId: string,
    @Query() pagination: PaginationDto,
  ) {
    const result = await this.getCustomerTimelineUseCase.execute(
      customerId,
      pagination.page,
      pagination.limit,
    );
    return {
      items: result.items.map(toCollectionActivityResponse),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  private getCurrentUser() {
    const user = this.tenantContext.getCurrentUser();
    if (!user) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Yêu cầu đăng nhập.');
    }
    return user;
  }
}
