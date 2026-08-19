import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
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
  ApiHeader,
  ApiNoContentResponse,
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
import { ErrorCode } from '../../../common/errors/error-code';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service';
import { ApiErrorResponse } from '../../../common/swagger/api-error-response.decorator';
import { successResponseSchema } from '../../../common/swagger/success-response-schema';
import {
  type IOrganizationRepository,
  ORGANIZATION_REPOSITORY,
} from '../../organizations/application/organization-repository.port';
import { ApproveOrganizationUseCase } from '../application/approve-organization.usecase';
import { BlockMemberByOperatorUseCase } from '../application/block-member-by-operator.usecase';
import { GetAiUsageAggregateUseCase } from '../application/get-ai-usage-aggregate.usecase';
import { GetAiUsageTrendUseCase } from '../application/get-ai-usage-trend.usecase';
import { GetOrganizationUseCase } from '../application/get-organization.usecase';
import { ListOrganizationMembersUseCase } from '../application/list-organization-members.usecase';
import { ListOrganizationsUseCase } from '../application/list-organizations.usecase';
import { LockOrganizationUseCase } from '../application/lock-organization.usecase';
import { RejectOrganizationUseCase } from '../application/reject-organization.usecase';
import { ResendInviteByOperatorUseCase } from '../application/resend-invite-by-operator.usecase';
import { RevokeInviteByOperatorUseCase } from '../application/revoke-invite-by-operator.usecase';
import { UnblockMemberByOperatorUseCase } from '../application/unblock-member-by-operator.usecase';
import { UnlockOrganizationUseCase } from '../application/unlock-organization.usecase';
import { AdminMembersQueryDto } from './dto/admin-members-query.dto';
import { AdminOrganizationsQueryDto } from './dto/admin-organizations-query.dto';
import {
  AdminAiUsageResponseDto,
  AdminAiUsageTrendResponseDto,
  AdminMembersResponseDto,
  AdminOrganizationItemResponseDto,
  AdminOrganizationStatusResponseDto,
  AdminOrganizationsResponseDto,
  toAdminOrganizationItemResponse,
} from './dto/admin-response.dto';
import { GetAiUsageQueryDto } from './dto/get-ai-usage-query.dto';
import { RejectOrganizationDto } from './dto/reject-organization.dto';

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
    private readonly approveOrganizationUseCase: ApproveOrganizationUseCase,
    private readonly rejectOrganizationUseCase: RejectOrganizationUseCase,
    private readonly blockMemberByOperatorUseCase: BlockMemberByOperatorUseCase,
    private readonly unblockMemberByOperatorUseCase: UnblockMemberByOperatorUseCase,
    private readonly getAiUsageAggregateUseCase: GetAiUsageAggregateUseCase,
    private readonly getAiUsageTrendUseCase: GetAiUsageTrendUseCase,
    private readonly getOrganizationUseCase: GetOrganizationUseCase,
    private readonly listOrganizationMembersUseCase: ListOrganizationMembersUseCase,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepo: IOrganizationRepository,
    private readonly idempotency: IdempotencyService,
    private readonly revokeInviteByOperatorUseCase: RevokeInviteByOperatorUseCase,
    private readonly resendInviteByOperatorUseCase: ResendInviteByOperatorUseCase,
  ) {}

  @Get('organizations')
  @ApiOperation({ summary: 'List organizations for Operators' })
  @ApiOkResponse({ type: AdminOrganizationsResponseDto })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
  )
  async listOrganizations(@Query() query: AdminOrganizationsQueryDto) {
    return this.listOrganizationsUseCase.execute({
      page: query.page,
      limit: query.limit,
      status: query.status,
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
    const organization = await this.getOrganizationUseCase.execute({
      organizationId: id,
    });
    return toAdminOrganizationItemResponse(organization);
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

  @Post('organizations/:id/approve')
  @ApiOperation({ summary: 'Approve an organization pending review' })
  @ApiCreatedResponse({ type: AdminOrganizationStatusResponseDto })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
    ErrorCode.NOT_FOUND,
    ErrorCode.CONFLICT,
  )
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AdminRequest,
  ) {
    await this.approveOrganizationUseCase.execute({
      organizationId: id,
      operatorId: request.user.operatorId,
    });
    return { status: 'ACTIVE' as const };
  }

  @Post('organizations/:id/reject')
  @ApiOperation({ summary: 'Reject an organization pending review' })
  @ApiCreatedResponse({ type: AdminOrganizationStatusResponseDto })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
    ErrorCode.NOT_FOUND,
    ErrorCode.CONFLICT,
  )
  async reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectOrganizationDto,
    @Req() request: AdminRequest,
  ) {
    await this.rejectOrganizationUseCase.execute({
      organizationId: id,
      operatorId: request.user.operatorId,
      reason: dto.reason,
    });
    return { status: 'REJECTED' as const };
  }

  @Get('organizations/:orgId/members')
  @ApiOperation({
    summary: 'List members and pending invites of an organization',
  })
  @ApiOkResponse({ type: AdminMembersResponseDto })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
    ErrorCode.NOT_FOUND,
  )
  async listOrganizationMembers(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Query() query: AdminMembersQueryDto,
  ) {
    return this.listOrganizationMembersUseCase.execute({
      organizationId: orgId,
      page: query.page,
      limit: query.limit,
      status: query.status,
      search: query.search,
    });
  }

  @Delete('organizations/:orgId/invites/:inviteId')
  @ApiOperation({ summary: 'Revoke a pending invite as an Operator' })
  @ApiHeader({ name: 'idempotency-key', required: true })
  @ApiNoContentResponse({ description: 'Invite revoked' })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
    ErrorCode.NOT_FOUND,
    ErrorCode.CONFLICT,
    ErrorCode.IDEMPOTENCY_KEY_REUSED,
  )
  @HttpCode(204)
  async revokeInvite(
    @Param('orgId', ParseUUIDPipe) organizationId: string,
    @Param('inviteId', ParseUUIDPipe) inviteId: string,
    @Req() request: AdminRequest,
    @Headers('idempotency-key') key: string | undefined,
  ): Promise<void> {
    await this.idempotency.executeForOrganization(
      organizationId,
      `DELETE /admin/organizations/${organizationId}/invites/${inviteId}`,
      key,
      { inviteId },
      () =>
        this.revokeInviteByOperatorUseCase.execute({
          organizationId,
          inviteId,
          operatorId: request.user.operatorId,
        }),
    );
  }

  @Post('organizations/:orgId/invites/:inviteId/resend')
  @ApiOperation({ summary: 'Resend a pending invite email as an Operator' })
  @ApiHeader({ name: 'idempotency-key', required: true })
  @ApiOkResponse({
    description: 'Invite resent',
    schema: successResponseSchema(),
  })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
    ErrorCode.NOT_FOUND,
    ErrorCode.CONFLICT,
    ErrorCode.IDEMPOTENCY_KEY_REUSED,
    ErrorCode.EMAIL_SEND_FAILED,
  )
  @HttpCode(200)
  async resendInvite(
    @Param('orgId', ParseUUIDPipe) organizationId: string,
    @Param('inviteId', ParseUUIDPipe) inviteId: string,
    @Req() request: AdminRequest,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.idempotency.executeForOrganization(
      organizationId,
      `POST /admin/organizations/${organizationId}/invites/${inviteId}/resend`,
      key,
      { inviteId },
      async () => {
        await this.resendInviteByOperatorUseCase.execute({
          organizationId,
          inviteId,
          operatorId: request.user.operatorId,
        });
        return { success: true };
      },
    );
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
