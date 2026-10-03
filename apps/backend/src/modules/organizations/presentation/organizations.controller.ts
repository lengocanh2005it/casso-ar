import { Permission } from '@casso-ar/shared-types';
import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  type AuthRequest,
  assertOrgMatches,
} from '../../../common/auth/assert-org-matches';
import { ErrorCode } from '../../../common/errors/error-code';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { ApiErrorResponse } from '../../../common/swagger/api-error-response.decorator';
import { ChangeMemberRoleUseCase } from '../application/change-member-role.usecase';
import { ListMembersUseCase } from '../application/list-members.usecase';
import { ListMembersQueryDto } from './dto/list-members-query.dto';
import {
  ListMembersResponseDto,
  toMemberResponse,
} from './dto/member-response.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';

@ApiTags('organizations')
@Controller('organizations')
@UseGuards(PermissionGuard)
export class OrganizationsController {
  constructor(
    private readonly listMembersUseCase: ListMembersUseCase,
    private readonly changeMemberRoleUseCase: ChangeMemberRoleUseCase,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Get(':id/members')
  @ApiOperation({ summary: 'List members of an organization' })
  @ApiOkResponse({ type: ListMembersResponseDto })
  @ApiErrorResponse(ErrorCode.VALIDATION_ERROR, ErrorCode.FORBIDDEN)
  @RequirePermission(Permission.ORGANIZATION_READ)
  async listMembers(
    @Param('id') id: string,
    @Query() pagination: ListMembersQueryDto,
  ) {
    const result = await this.listMembersUseCase.execute({
      organizationId: id,
      page: pagination.page,
      limit: pagination.limit,
      status: pagination.status,
    });
    return {
      items: result.items.map((x) => toMemberResponse(x.membership, x.user)),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  @Patch(':id/members/:userId')
  @ApiOperation({ summary: 'Change a member role in an organization' })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiOkResponse({
    description: 'Updated membership',
    schema: {
      type: 'object',
      required: ['id', 'userId', 'role'],
      properties: {
        id: { type: 'string', format: 'uuid' },
        userId: { type: 'string', format: 'uuid' },
        role: { type: 'string' },
      },
    },
  })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.FORBIDDEN,
    ErrorCode.NOT_FOUND,
    ErrorCode.CONFLICT,
    ErrorCode.IDEMPOTENCY_KEY_REUSED,
  )
  @RequirePermission(Permission.ORGANIZATION_MANAGE)
  async changeMemberRole(
    @Param('id') id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateMemberRoleDto,
    @Req() request: AuthRequest,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    assertOrgMatches(request, id);
    return this.idempotency.execute(
      `PATCH /organizations/${id}/members/${userId}`,
      key,
      dto,
      async () => {
        const membership = await this.changeMemberRoleUseCase.execute({
          userId,
          role: dto.role,
        });
        return {
          id: membership.id,
          userId: membership.userId,
          role: membership.role,
        };
      },
    );
  }
}
