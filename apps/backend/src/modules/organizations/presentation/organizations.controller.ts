import { Permission } from '@casso-ledger/shared-types';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { ChangeMemberRoleUseCase } from '../application/change-member-role.usecase';
import { ListMembersUseCase } from '../application/list-members.usecase';
import { toMemberResponse } from './dto/member-response.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';

interface AuthRequest extends Request {
  user?: { userId: string; organizationId: string };
}

@Controller('organizations')
@UseGuards(PermissionGuard)
export class OrganizationsController {
  constructor(
    private readonly listMembersUseCase: ListMembersUseCase,
    private readonly changeMemberRoleUseCase: ChangeMemberRoleUseCase,
  ) {}

  @Get(':id/members')
  @RequirePermission(Permission.ORGANIZATION_READ)
  async listMembers(
    @Param('id') id: string,
    @Query() pagination: PaginationDto,
  ) {
    const result = await this.listMembersUseCase.execute({
      organizationId: id,
      page: pagination.page,
      limit: pagination.limit,
    });
    return {
      items: result.items.map((x) => toMemberResponse(x.membership, x.user)),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  @Patch(':id/members/:userId')
  @RequirePermission(Permission.ORGANIZATION_MANAGE)
  async changeMemberRole(
    @Param('id') id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateMemberRoleDto,
    @Req() request: AuthRequest,
  ) {
    if (request.user?.organizationId !== id) {
      throw new ForbiddenException('Organization mismatch');
    }
    const membership = await this.changeMemberRoleUseCase.execute({
      userId,
      role: dto.role,
    });
    return {
      id: membership.id,
      userId: membership.userId,
      role: membership.role,
    };
  }
}
