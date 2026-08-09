import { Permission } from '@casso-ledger/shared-types';
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { ListMembersUseCase } from '../application/list-members.usecase';
import { toMemberResponse } from './dto/member-response.dto';

@Controller('organizations')
@UseGuards(PermissionGuard)
export class OrganizationsController {
  constructor(private readonly listMembersUseCase: ListMembersUseCase) {}

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
}
