import { Permission } from '@casso-ledger/shared-types';
import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { ErrorCode } from '../../../common/errors/error-code';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { ApiErrorResponse } from '../../../common/swagger/api-error-response.decorator';
import { AcceptOwnershipTransferUseCase } from '../application/accept-ownership-transfer.usecase';
import { CancelOwnershipTransferUseCase } from '../application/cancel-ownership-transfer.usecase';
import { ConfirmOwnershipTransferUseCase } from '../application/confirm-ownership-transfer.usecase';
import { DeclineOwnershipTransferUseCase } from '../application/decline-ownership-transfer.usecase';
import { GetCurrentOwnershipTransferUseCase } from '../application/get-current-ownership-transfer.usecase';
import { GetPendingOwnershipTransferForMeUseCase } from '../application/get-pending-ownership-transfer-for-me.usecase';
import { RequestOwnershipTransferUseCase } from '../application/request-ownership-transfer.usecase';
import { ConfirmOwnershipTransferDto } from './dto/confirm-ownership-transfer.dto';
import {
  OwnershipTransferResponseDto,
  toOwnershipTransferResponse,
} from './dto/ownership-transfer-response.dto';
import { RequestOwnershipTransferDto } from './dto/request-ownership-transfer.dto';

interface AuthRequest extends Request {
  user?: { userId: string };
  tenant?: { organizationId: string };
}

function assertOrgMatches(request: AuthRequest, id: string): void {
  if (request.tenant?.organizationId !== id) {
    throw new UnauthorizedException();
  }
}

function requireUserId(request: AuthRequest): string {
  if (!request.user?.userId) {
    throw new UnauthorizedException();
  }
  return request.user.userId;
}

@ApiTags('auth')
@Controller('auth')
export class OwnershipTransferController {
  constructor(
    private readonly requestUseCase: RequestOwnershipTransferUseCase,
    private readonly confirmUseCase: ConfirmOwnershipTransferUseCase,
    private readonly cancelUseCase: CancelOwnershipTransferUseCase,
    private readonly acceptUseCase: AcceptOwnershipTransferUseCase,
    private readonly declineUseCase: DeclineOwnershipTransferUseCase,
    private readonly getCurrentUseCase: GetCurrentOwnershipTransferUseCase,
    private readonly getPendingForMeUseCase: GetPendingOwnershipTransferForMeUseCase,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post('organizations/:id/ownership-transfers')
  @ApiOperation({ summary: 'Request an ownership transfer to another member' })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiOkResponse({ type: OwnershipTransferResponseDto })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.FORBIDDEN,
    ErrorCode.NOT_FOUND,
    ErrorCode.CONFLICT,
    ErrorCode.IDEMPOTENCY_KEY_REUSED,
  )
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission(Permission.OWNERSHIP_TRANSFER_MANAGE)
  async request(
    @Param('id') id: string,
    @Body() dto: RequestOwnershipTransferDto,
    @Req() request: AuthRequest,
    @Headers('idempotency-key') key: string | undefined,
  ): Promise<OwnershipTransferResponseDto> {
    assertOrgMatches(request, id);
    return this.idempotency.execute(
      `POST /organizations/${id}/ownership-transfers`,
      key,
      dto,
      async () =>
        toOwnershipTransferResponse(
          await this.requestUseCase.execute({
            organizationId: id,
            requestedByUserId: requireUserId(request),
            targetUserId: dto.targetUserId,
            currentPassword: dto.currentPassword,
          }),
        ),
    );
  }

  @Post('organizations/:id/ownership-transfers/:requestId/confirm')
  @ApiOperation({ summary: 'Confirm an ownership transfer request with OTP' })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiOkResponse({ type: OwnershipTransferResponseDto })
  @ApiErrorResponse(
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
    ErrorCode.NOT_FOUND,
    ErrorCode.CONFLICT,
    ErrorCode.IDEMPOTENCY_KEY_REUSED,
  )
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission(Permission.OWNERSHIP_TRANSFER_MANAGE)
  async confirm(
    @Param('id') id: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() dto: ConfirmOwnershipTransferDto,
    @Req() request: AuthRequest,
    @Headers('idempotency-key') key: string | undefined,
  ): Promise<OwnershipTransferResponseDto> {
    assertOrgMatches(request, id);
    return this.idempotency.execute(
      `POST /organizations/${id}/ownership-transfers/${requestId}/confirm`,
      key,
      dto,
      async () =>
        toOwnershipTransferResponse(
          await this.confirmUseCase.execute({
            organizationId: id,
            requestId,
            requestedByUserId: requireUserId(request),
            otp: dto.otp,
          }),
        ),
    );
  }

  @Post('organizations/:id/ownership-transfers/:requestId/cancel')
  @ApiOperation({ summary: 'Cancel a pending ownership transfer' })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiOkResponse({ type: OwnershipTransferResponseDto })
  @ApiErrorResponse(
    ErrorCode.FORBIDDEN,
    ErrorCode.NOT_FOUND,
    ErrorCode.CONFLICT,
    ErrorCode.IDEMPOTENCY_KEY_REUSED,
  )
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission(Permission.OWNERSHIP_TRANSFER_MANAGE)
  async cancel(
    @Param('id') id: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Req() request: AuthRequest,
    @Headers('idempotency-key') key: string | undefined,
  ): Promise<OwnershipTransferResponseDto> {
    assertOrgMatches(request, id);
    return this.idempotency.execute(
      `POST /organizations/${id}/ownership-transfers/${requestId}/cancel`,
      key,
      {},
      async () =>
        toOwnershipTransferResponse(
          await this.cancelUseCase.execute({
            organizationId: id,
            requestId,
            requestedByUserId: requireUserId(request),
          }),
        ),
    );
  }

  @Post('organizations/:id/ownership-transfers/:requestId/accept')
  @ApiOperation({ summary: 'Accept an ownership transfer targeted at you' })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiOkResponse({ type: OwnershipTransferResponseDto })
  @ApiErrorResponse(
    ErrorCode.FORBIDDEN,
    ErrorCode.NOT_FOUND,
    ErrorCode.CONFLICT,
    ErrorCode.IDEMPOTENCY_KEY_REUSED,
  )
  @UseGuards(JwtAuthGuard)
  async accept(
    @Param('id') id: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Req() request: AuthRequest,
    @Headers('idempotency-key') key: string | undefined,
  ): Promise<OwnershipTransferResponseDto> {
    assertOrgMatches(request, id);
    return this.idempotency.execute(
      `POST /organizations/${id}/ownership-transfers/${requestId}/accept`,
      key,
      {},
      async () =>
        toOwnershipTransferResponse(
          await this.acceptUseCase.execute({
            organizationId: id,
            requestId,
            actingUserId: requireUserId(request),
          }),
        ),
    );
  }

  @Post('organizations/:id/ownership-transfers/:requestId/decline')
  @ApiOperation({ summary: 'Decline an ownership transfer targeted at you' })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiOkResponse({ type: OwnershipTransferResponseDto })
  @ApiErrorResponse(
    ErrorCode.FORBIDDEN,
    ErrorCode.NOT_FOUND,
    ErrorCode.CONFLICT,
    ErrorCode.IDEMPOTENCY_KEY_REUSED,
  )
  @UseGuards(JwtAuthGuard)
  async decline(
    @Param('id') id: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Req() request: AuthRequest,
    @Headers('idempotency-key') key: string | undefined,
  ): Promise<OwnershipTransferResponseDto> {
    assertOrgMatches(request, id);
    return this.idempotency.execute(
      `POST /organizations/${id}/ownership-transfers/${requestId}/decline`,
      key,
      {},
      async () =>
        toOwnershipTransferResponse(
          await this.declineUseCase.execute({
            organizationId: id,
            requestId,
            actingUserId: requireUserId(request),
          }),
        ),
    );
  }

  @Get('organizations/:id/ownership-transfers/current')
  @ApiOperation({ summary: "Get the organization's own in-flight transfer request" })
  @ApiOkResponse({ type: OwnershipTransferResponseDto })
  @ApiErrorResponse(ErrorCode.FORBIDDEN)
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission(Permission.OWNERSHIP_TRANSFER_MANAGE)
  async current(
    @Param('id') id: string,
    @Req() request: AuthRequest,
  ): Promise<OwnershipTransferResponseDto | null> {
    assertOrgMatches(request, id);
    const current = await this.getCurrentUseCase.execute(id);
    return current ? toOwnershipTransferResponse(current) : null;
  }

  @Get('organizations/:id/ownership-transfers/pending-for-me')
  @ApiOperation({ summary: 'Get a pending ownership transfer targeted at the caller' })
  @ApiOkResponse({ type: OwnershipTransferResponseDto })
  @ApiErrorResponse(ErrorCode.FORBIDDEN)
  @UseGuards(JwtAuthGuard)
  async pendingForMe(
    @Param('id') id: string,
    @Req() request: AuthRequest,
  ): Promise<OwnershipTransferResponseDto | null> {
    assertOrgMatches(request, id);
    const pending = await this.getPendingForMeUseCase.execute(
      id,
      requireUserId(request),
    );
    return pending ? toOwnershipTransferResponse(pending) : null;
  }
}
