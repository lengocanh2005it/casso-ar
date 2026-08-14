import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { AdminAuthGuard } from '../../../common/admin/admin-auth.guard';
import type { AuthenticatedOperator } from '../../../common/admin/authenticated-operator';
import { Public } from '../../../common/auth/public.decorator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { ErrorCode } from '../../../common/errors/error-code';
import { ApiErrorResponse } from '../../../common/swagger/api-error-response.decorator';
import { GetAiUsageAggregateUseCase } from '../application/get-ai-usage-aggregate.usecase';
import { GetAiUsageTrendUseCase } from '../application/get-ai-usage-trend.usecase';
import { ListOrganizationsUseCase } from '../application/list-organizations.usecase';
import { LockOrganizationUseCase } from '../application/lock-organization.usecase';
import { UnlockOrganizationUseCase } from '../application/unlock-organization.usecase';
import {
  AdminAiUsageResponseDto,
  AdminAiUsageTrendResponseDto,
  AdminOrganizationStatusResponseDto,
  AdminOrganizationsResponseDto,
} from './dto/admin-response.dto';
import { GetAiUsageQueryDto } from './dto/get-ai-usage-query.dto';

interface AdminRequest extends Request {
  user: AuthenticatedOperator;
}

@ApiTags('admin')
@Controller('admin')
@Public()
@UseGuards(AdminAuthGuard)
export class AdminController {
  constructor(
    private readonly listOrganizationsUseCase: ListOrganizationsUseCase,
    private readonly lockOrganizationUseCase: LockOrganizationUseCase,
    private readonly unlockOrganizationUseCase: UnlockOrganizationUseCase,
    private readonly getAiUsageAggregateUseCase: GetAiUsageAggregateUseCase,
    private readonly getAiUsageTrendUseCase: GetAiUsageTrendUseCase,
  ) {}

  @Get('organizations')
  @ApiOperation({ summary: 'List organizations for Operators' })
  @ApiOkResponse({ type: AdminOrganizationsResponseDto })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
  )
  async listOrganizations(@Query() pagination: PaginationDto) {
    return this.listOrganizationsUseCase.execute({
      page: pagination.page,
      limit: pagination.limit,
    });
  }

  @Post('organizations/:id/lock')
  @ApiOperation({ summary: 'Lock an organization' })
  @ApiCreatedResponse({ type: AdminOrganizationStatusResponseDto })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
    ErrorCode.NOT_FOUND,
  )
  async lock(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AdminRequest,
  ) {
    await this.lockOrganizationUseCase.execute({
      organizationId: id,
      operatorId: request.user.operatorId,
    });
    return { status: 'LOCKED' as const };
  }

  @Post('organizations/:id/unlock')
  @ApiOperation({ summary: 'Unlock an organization' })
  @ApiCreatedResponse({ type: AdminOrganizationStatusResponseDto })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
    ErrorCode.NOT_FOUND,
  )
  async unlock(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AdminRequest,
  ) {
    await this.unlockOrganizationUseCase.execute({
      organizationId: id,
      operatorId: request.user.operatorId,
    });
    return { status: 'ACTIVE' as const };
  }

  @Get('ai-usage')
  @ApiOperation({ summary: 'Get cross-organization AI usage' })
  @ApiOkResponse({ type: AdminAiUsageResponseDto })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
  )
  async getAiUsage(@Query() query: GetAiUsageQueryDto) {
    const items = await this.getAiUsageAggregateUseCase.execute({
      from: new Date(query.from),
      to: new Date(query.to),
    });
    return { items };
  }

  @Get('ai-usage/trend')
  @ApiOperation({ summary: 'Get daily cross-organization AI usage trend' })
  @ApiOkResponse({ type: AdminAiUsageTrendResponseDto })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
  )
  async getAiUsageTrend(@Query() query: GetAiUsageQueryDto) {
    const items = await this.getAiUsageTrendUseCase.execute({
      from: new Date(query.from),
      to: new Date(query.to),
    });
    return { items };
  }
}
