import { Permission } from '@casso-ledger/shared-types';
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
import { ApiTags } from '@nestjs/swagger';
import {
  type AuthRequest,
  assertOrgMatches,
} from '../../../common/auth/assert-org-matches';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../../common/auth/optional-jwt-auth.guard';
import { Public } from '../../../common/auth/public.decorator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import {
  type IOrganizationRepository,
  ORGANIZATION_REPOSITORY,
} from '../../organizations/application/organization-repository.port';
import { AcceptInviteUseCase } from '../application/accept-invite.usecase';
import { DeleteInviteUseCase } from '../application/delete-invite.usecase';
import { InviteMemberUseCase } from '../application/invite-member.usecase';
import { ListInvitesUseCase } from '../application/list-invites.usecase';
import { RemoveMemberUseCase } from '../application/remove-member.usecase';
import { ResendInviteUseCase } from '../application/resend-invite.usecase';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { toInviteResponse } from './dto/invite-response.dto';

@ApiTags('auth-invites')
@Controller()
export class InvitesController {
  constructor(
    private readonly inviteMemberUseCase: InviteMemberUseCase,
    private readonly acceptInviteUseCase: AcceptInviteUseCase,
    private readonly deleteInviteUseCase: DeleteInviteUseCase,
    private readonly resendInviteUseCase: ResendInviteUseCase,
    private readonly removeMemberUseCase: RemoveMemberUseCase,
    private readonly listInvitesUseCase: ListInvitesUseCase,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepo: IOrganizationRepository,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post('organizations/:id/invites')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission(Permission.USER_MANAGE)
  async invite(
    @Param('id') organizationId: string,
    @Body() dto: InviteMemberDto,
    @Req() request: AuthRequest,
  ) {
    assertOrgMatches(request, organizationId);
    const organization = await this.organizationRepo.findById(organizationId);
    if (!organization) throw new NotFoundException('Organization not found');

    await this.inviteMemberUseCase.execute({
      organizationId,
      organizationName: organization.name,
      email: dto.email,
      role: dto.role,
      invitedByUserId: request.user?.userId ?? '',
    });
    return { success: true };
  }

  @Get('organizations/:id/invites')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission(Permission.ORGANIZATION_MANAGE)
  async listInvites(
    @Param('id') organizationId: string,
    @Query() pagination: PaginationDto,
    @Req() request: AuthRequest,
  ) {
    assertOrgMatches(request, organizationId);
    const result = await this.listInvitesUseCase.execute({
      page: pagination.page,
      limit: pagination.limit,
    });
    return {
      items: result.items.map(toInviteResponse),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  @Public()
  @Post('invites/accept')
  @UseGuards(OptionalJwtAuthGuard)
  async accept(@Body() dto: AcceptInviteDto, @Req() request: AuthRequest) {
    await this.acceptInviteUseCase.execute({
      token: dto.token,
      name: dto.name,
      password: dto.password,
      authenticatedUserId: request.user?.userId,
    });
    return { success: true };
  }

  @Delete('organizations/:id/invites/:inviteId')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission(Permission.ORGANIZATION_MANAGE)
  async revokeInvite(
    @Param('id') organizationId: string,
    @Param('inviteId', ParseUUIDPipe) inviteId: string,
    @Req() request: AuthRequest,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    assertOrgMatches(request, organizationId);
    await this.idempotency.execute(
      `DELETE /organizations/${organizationId}/invites/${inviteId}`,
      key,
      { inviteId },
      () => this.deleteInviteUseCase.execute(inviteId),
    );
  }

  @Delete('organizations/:id/members/:userId')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission(Permission.ORGANIZATION_MANAGE)
  async removeMember(
    @Param('id') organizationId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Req() request: AuthRequest,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    assertOrgMatches(request, organizationId);
    await this.idempotency.execute(
      `DELETE /organizations/${organizationId}/members/${userId}`,
      key,
      { userId },
      () => this.removeMemberUseCase.execute({ userId }),
    );
  }

  @Post('organizations/:id/invites/:inviteId/resend')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission(Permission.ORGANIZATION_MANAGE)
  async resendInvite(
    @Param('id') organizationId: string,
    @Param('inviteId', ParseUUIDPipe) inviteId: string,
    @Req() request: AuthRequest,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    assertOrgMatches(request, organizationId);
    return this.idempotency.execute(
      `POST /organizations/${organizationId}/invites/${inviteId}/resend`,
      key,
      { inviteId },
      async () => {
        await this.resendInviteUseCase.execute(inviteId);
        return { success: true };
      },
    );
  }
}
