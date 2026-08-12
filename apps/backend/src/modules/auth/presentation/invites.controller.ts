import { Permission } from '@casso-ledger/shared-types';
import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../../common/auth/optional-jwt-auth.guard';
import { Public } from '../../../common/auth/public.decorator';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import {
  type IOrganizationRepository,
  ORGANIZATION_REPOSITORY,
} from '../../organizations/application/organization-repository.port';
import { AcceptInviteUseCase } from '../application/accept-invite.usecase';
import { DeleteInviteUseCase } from '../application/delete-invite.usecase';
import { InviteMemberUseCase } from '../application/invite-member.usecase';
import { RemoveMemberUseCase } from '../application/remove-member.usecase';
import { ResendInviteUseCase } from '../application/resend-invite.usecase';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { InviteMemberDto } from './dto/invite-member.dto';

interface AuthRequest extends Request {
  user?: { userId: string; organizationId: string };
}

@Controller()
export class InvitesController {
  constructor(
    private readonly inviteMemberUseCase: InviteMemberUseCase,
    private readonly acceptInviteUseCase: AcceptInviteUseCase,
    private readonly deleteInviteUseCase: DeleteInviteUseCase,
    private readonly resendInviteUseCase: ResendInviteUseCase,
    private readonly removeMemberUseCase: RemoveMemberUseCase,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepo: IOrganizationRepository,
  ) {}

  @Post('organizations/:id/invites')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission(Permission.USER_MANAGE)
  async invite(
    @Param('id') organizationId: string,
    @Body() dto: InviteMemberDto,
    @Req() request: AuthRequest,
  ) {
    if (request.user?.organizationId !== organizationId) {
      throw new ForbiddenException('Organization mismatch');
    }
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
  @RequirePermission(Permission.USER_MANAGE)
  async revokeInvite(
    @Param('id') organizationId: string,
    @Param('inviteId', ParseUUIDPipe) inviteId: string,
    @Req() request: AuthRequest,
  ) {
    if (request.user?.organizationId !== organizationId) {
      throw new ForbiddenException('Organization mismatch');
    }
    await this.deleteInviteUseCase.execute(inviteId);
  }

  @Delete('organizations/:id/members/:userId')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission(Permission.ORGANIZATION_MANAGE)
  async removeMember(
    @Param('id') organizationId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Req() request: AuthRequest,
  ) {
    if (request.user?.organizationId !== organizationId) {
      throw new ForbiddenException('Organization mismatch');
    }
    await this.removeMemberUseCase.execute({ userId });
  }

  @Post('organizations/:id/invites/:inviteId/resend')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission(Permission.USER_MANAGE)
  async resendInvite(
    @Param('id') organizationId: string,
    @Param('inviteId', ParseUUIDPipe) inviteId: string,
    @Req() request: AuthRequest,
  ) {
    if (request.user?.organizationId !== organizationId) {
      throw new ForbiddenException('Organization mismatch');
    }
    await this.resendInviteUseCase.execute(inviteId);
    return { success: true };
  }
}
