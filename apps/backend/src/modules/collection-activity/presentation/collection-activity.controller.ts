import { Permission } from '@casso-ar/shared-types';
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
import { GetCustomerTimelineUseCase } from '../application/get-customer-timeline.usecase';
import { GetOrganizationTimelineUseCase } from '../application/get-organization-timeline.usecase';
import { GetReceivableTimelineUseCase } from '../application/get-receivable-timeline.usecase';
import { RecordManualActivityUseCase } from '../application/record-manual-activity.usecase';
import {
  CollectionActivityPageResponseDto,
  CollectionActivityResponseDto,
  toCollectionActivityResponse,
} from './dto/collection-activity-response.dto';
import { CreateManualActivityDto } from './dto/create-manual-activity.dto';

@ApiTags('collection-activity')
@Controller()
@UseGuards(PermissionGuard)
export class CollectionActivityController {
  constructor(
    private readonly recordManualActivityUseCase: RecordManualActivityUseCase,
    private readonly getReceivableTimelineUseCase: GetReceivableTimelineUseCase,
    private readonly getCustomerTimelineUseCase: GetCustomerTimelineUseCase,
    private readonly getOrganizationTimelineUseCase: GetOrganizationTimelineUseCase,
    private readonly tenantContext: TenantContextService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post('receivables/:id/activities')
  @ApiOperation({ summary: 'Record a manual collection activity' })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiCreatedResponse({ type: CollectionActivityResponseDto })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.RECEIVABLE_NOT_FOUND,
    ErrorCode.IDEMPOTENCY_KEY_REUSED,
  )
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
  @ApiOperation({
    summary: 'Get the collection activity timeline of a receivable',
  })
  @ApiOkResponse({ type: CollectionActivityPageResponseDto })
  @ApiErrorResponse(ErrorCode.VALIDATION_ERROR)
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
  @ApiOperation({
    summary: 'Get the collection activity timeline of a customer',
  })
  @ApiOkResponse({ type: CollectionActivityPageResponseDto })
  @ApiErrorResponse(ErrorCode.VALIDATION_ERROR)
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

  @Get('activity')
  @ApiOperation({
    summary: 'Get the organization-wide collection activity feed',
  })
  @ApiOkResponse({ type: CollectionActivityPageResponseDto })
  @ApiErrorResponse(ErrorCode.VALIDATION_ERROR)
  @RequirePermission(Permission.RECEIVABLE_READ)
  async organizationTimeline(@Query() pagination: PaginationDto) {
    const result = await this.getOrganizationTimelineUseCase.execute(
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
