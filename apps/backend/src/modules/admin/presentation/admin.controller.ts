import {
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
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
import {
  MemberStatusResponseDto,
  toMemberStatusResponse,
} from '../../../common/dto/member-status-response.dto';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { ErrorCode } from '../../../common/errors/error-code';
import { ApiErrorResponse } from '../../../common/swagger/api-error-response.decorator';
import {
  type IOrganizationRepository,
  ORGANIZATION_REPOSITORY,
} from '../../organizations/application/organization-repository.port';
import { BlockMemberByOperatorUseCase } from '../application/block-member-by-operator.usecase';
import { GetAiUsageAggregateUseCase } from '../application/get-ai-usage-aggregate.usecase';
import { GetAiUsageTrendUseCase } from '../application/get-ai-usage-trend.usecase';
import { GetOrganizationUseCase } from '../application/get-organization.usecase';
import { ListOrganizationsUseCase } from '../application/list-organizations.usecase';
import { LockOrganizationUseCase } from '../application/lock-organization.usecase';
import { UnblockMemberByOperatorUseCase } from '../application/unblock-member-by-operator.usecase';
import { UnlockOrganizationUseCase } from '../application/unlock-organization.usecase';
import {
  AdminAiUsageResponseDto,
  AdminAiUsageTrendResponseDto,
  AdminOrganizationItemResponseDto,
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
    private readonly blockMemberByOperatorUseCase: BlockMemberByOperatorUseCase,
    private readonly unblockMemberByOperatorUseCase: UnblockMemberByOperatorUseCase,
    private readonly getAiUsageAggregateUseCase: GetAiUsageAggregateUseCase,
    private readonly getAiUsageTrendUseCase: GetAiUsageTrendUseCase,
    private readonly getOrganizationUseCase: GetOrganizationUseCase,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepo: IOrganizationRepository,
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

  @Get('organizations/:id')
  @ApiOperation({ summary: 'Get an organization for Operators' })
  @ApiOkResponse({ type: AdminOrganizationItemResponseDto })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
    ErrorCode.NOT_FOUND,
  )
  async getOrganization(@Param('id', ParseUUIDPipe) id: string) {
    return this.getOrganizationUseCase.execute({ organizationId: id });
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

  @Post('organizations/:orgId/members/:userId/block')
  @ApiOperation({ summary: 'Block a member of any organization' })
  @ApiOkResponse({ type: MemberStatusResponseDto })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
    ErrorCode.NOT_FOUND,
  )
  @HttpCode(200)
  async blockMember(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Req() request: AdminRequest,
  ) {
    const organization = await this.organizationRepo.findById(orgId);
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }
    const membership = await this.blockMemberByOperatorUseCase.execute({
      organizationId: orgId,
      organizationName: organization.name,
      userId,
      operatorId: request.user.operatorId,
    });
    return toMemberStatusResponse(membership);
  }

  @Post('organizations/:orgId/members/:userId/unblock')
  @ApiOperation({ summary: 'Unblock a member of any organization' })
  @ApiOkResponse({ type: MemberStatusResponseDto })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
    ErrorCode.NOT_FOUND,
  )
  @HttpCode(200)
  async unblockMember(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Req() request: AdminRequest,
  ) {
    const organization = await this.organizationRepo.findById(orgId);
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }
    const membership = await this.unblockMemberByOperatorUseCase.execute({
      organizationId: orgId,
      organizationName: organization.name,
      userId,
      operatorId: request.user.operatorId,
    });
    return toMemberStatusResponse(membership);
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
      to: endOfDayUtc(query.to),
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
      to: endOfDayUtc(query.to),
    });
    return { items };
  }
}

// `to` arrives as a date-only string (YYYY-MM-DD); parsing it directly yields
// UTC midnight, which excludes that entire day from a BETWEEN range.
function endOfDayUtc(dateOnly: string): Date {
  const date = new Date(dateOnly);
  date.setUTCHours(23, 59, 59, 999);
  return date;
}
