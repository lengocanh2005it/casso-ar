import { Permission } from '@casso-ledger/shared-types';
import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  AuditActionType,
  AuditEntityType,
} from '../../../common/audit/audit.enums';
import { Audited } from '../../../common/audit/audited.decorator';
import { type AuthRequest } from '../../../common/auth/assert-org-matches';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { ErrorCode } from '../../../common/errors/error-code';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { ApiErrorResponse } from '../../../common/swagger/api-error-response.decorator';
import { successResponseSchema } from '../../../common/swagger/success-response-schema';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { ConnectCassoFlowUseCase } from '../application/connect-casso-flow.usecase';
import { DisconnectConnectionUseCase } from '../application/disconnect-connection.usecase';
import { ListAuthorizationAuditEventsUseCase } from '../application/list-authorization-audit-events.usecase';
import { ListBankConnectionsUseCase } from '../application/list-bank-connections.usecase';
import { PreviewCassoFlowAccountsUseCase } from '../application/preview-casso-flow-accounts.usecase';
import { PreviewCassoFlowAuthorizationRotationUseCase } from '../application/preview-casso-flow-authorization-rotation.usecase';
import { RevealCassoFlowApiKeyUseCase } from '../application/reveal-casso-flow-api-key.usecase';
import { RotateCassoFlowAuthorizationUseCase } from '../application/rotate-casso-flow-authorization.usecase';
import {
  ListBankConnectionsResponseDto,
  toBankConnectionResponse,
} from './dto/bank-connection-response.dto';
import {
  ConfirmCassoFlowDto,
  ConnectCassoFlowResponseDto,
} from './dto/confirm-casso-flow.dto';
import {
  ListConnectionAuditEventsResponseDto,
  toConnectionAuditEventResponse,
} from './dto/connection-audit-event-response.dto';
import {
  PreviewCassoFlowAccountsResponseDto,
  PreviewCassoFlowAuthorizationRotationResponseDto,
  PreviewCassoFlowDto,
} from './dto/preview-casso-flow.dto';
import {
  RevealCassoFlowApiKeyDto,
  RevealCassoFlowApiKeyResponseDto,
} from './dto/reveal-casso-flow-api-key.dto';
import {
  RotateCassoFlowAuthorizationResponseDto,
  RotateCassoFlowDto,
} from './dto/rotate-casso-flow-authorization.dto';

@ApiTags('bank-connections')
@Controller('bank-connections')
@UseGuards(PermissionGuard)
export class BankConnectionsController {
  constructor(
    private readonly listBankConnectionsUseCase: ListBankConnectionsUseCase,
    private readonly previewCassoFlowAccountsUseCase: PreviewCassoFlowAccountsUseCase,
    private readonly connectCassoFlowUseCase: ConnectCassoFlowUseCase,
    private readonly previewCassoFlowAuthorizationRotationUseCase: PreviewCassoFlowAuthorizationRotationUseCase,
    private readonly rotateCassoFlowAuthorizationUseCase: RotateCassoFlowAuthorizationUseCase,
    private readonly revealCassoFlowApiKeyUseCase: RevealCassoFlowApiKeyUseCase,
    private readonly disconnectConnectionUseCase: DisconnectConnectionUseCase,
    private readonly listAuthorizationAuditEventsUseCase: ListAuthorizationAuditEventsUseCase,
    private readonly idempotency: IdempotencyService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List bank connections with pagination' })
  @ApiOkResponse({ type: ListBankConnectionsResponseDto })
  @ApiErrorResponse(ErrorCode.VALIDATION_ERROR)
  @RequirePermission(Permission.BANK_CONNECTION_READ)
  async findAll(@Query() query: PaginationDto) {
    const result = await this.listBankConnectionsUseCase.execute(
      query.page,
      query.limit,
    );
    return {
      items: result.items.map(toBankConnectionResponse),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  @Post('casso-flow/preview')
  @ApiOperation({
    summary: 'Preview the bank accounts a Casso Flow API Key can connect',
  })
  @ApiOkResponse({ type: PreviewCassoFlowAccountsResponseDto })
  @ApiErrorResponse(ErrorCode.VALIDATION_ERROR, ErrorCode.UNAUTHORIZED)
  @RequirePermission(Permission.BANK_CONNECTION_MANAGE)
  async preview(@Body() dto: PreviewCassoFlowDto) {
    return this.previewCassoFlowAccountsUseCase.execute({
      organizationId: this.tenantContext.getOrganizationId(),
      apiKey: dto.apiKey,
    });
  }

  @Post('casso-flow/confirm')
  @ApiOperation({
    summary: 'Connect the selected bank accounts from a Casso Flow API Key',
  })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiCreatedResponse({ type: ConnectCassoFlowResponseDto })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.IDEMPOTENCY_KEY_REUSED,
  )
  @RequirePermission(Permission.BANK_CONNECTION_MANAGE)
  @Audited(
    AuditActionType.BANK_CONNECTION_CREATE,
    AuditEntityType.BANK_CONNECTION,
  )
  async confirm(
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: ConfirmCassoFlowDto,
    @Req() request: AuthRequest,
  ) {
    const userId = request.user?.userId;
    if (!userId) {
      throw new UnauthorizedException();
    }
    return this.idempotency.execute(
      'POST /bank-connections/casso-flow/confirm',
      key,
      dto,
      () =>
        this.connectCassoFlowUseCase.execute({
          organizationId: this.tenantContext.getOrganizationId(),
          apiKey: dto.apiKey,
          selectedAccountNumbers: dto.selectedAccountNumbers,
          userId,
        }),
    );
  }

  @Post('authorizations/:id/casso-flow/preview')
  @ApiOperation({
    summary:
      "Preview rotating one CassoFlowAuthorization's API Key against its currently connected accounts",
  })
  @ApiOkResponse({ type: PreviewCassoFlowAuthorizationRotationResponseDto })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.NOT_FOUND,
    ErrorCode.CONFLICT,
  )
  @RequirePermission(Permission.BANK_CONNECTION_MANAGE)
  async previewRotation(
    @Param('id') authorizationId: string,
    @Body() dto: PreviewCassoFlowDto,
  ) {
    return this.previewCassoFlowAuthorizationRotationUseCase.execute({
      organizationId: this.tenantContext.getOrganizationId(),
      cassoFlowAuthorizationId: authorizationId,
      apiKey: dto.apiKey,
    });
  }

  @Post('authorizations/:id/casso-flow/confirm')
  @ApiOperation({ summary: "Rotate one CassoFlowAuthorization's API Key" })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiCreatedResponse({ type: RotateCassoFlowAuthorizationResponseDto })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.NOT_FOUND,
    ErrorCode.CONFLICT,
    ErrorCode.IDEMPOTENCY_KEY_REUSED,
  )
  @RequirePermission(Permission.BANK_CONNECTION_MANAGE)
  @Audited(
    AuditActionType.BANK_CONNECTION_API_KEY_ROTATE,
    AuditEntityType.CASSO_FLOW_AUTHORIZATION,
  )
  async rotate(
    @Param('id') authorizationId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: RotateCassoFlowDto,
    @Req() request: AuthRequest,
  ) {
    const userId = request.user?.userId;
    if (!userId) {
      throw new UnauthorizedException();
    }
    return this.idempotency.execute(
      `POST /bank-connections/authorizations/${authorizationId}/casso-flow/confirm`,
      key,
      dto,
      () =>
        this.rotateCassoFlowAuthorizationUseCase.execute({
          organizationId: this.tenantContext.getOrganizationId(),
          cassoFlowAuthorizationId: authorizationId,
          apiKey: dto.apiKey,
          userId,
        }),
    );
  }

  @Post('authorizations/:id/reveal-key')
  @ApiOperation({ summary: "Reveal one CassoFlowAuthorization's full API Key" })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiCreatedResponse({ type: RevealCassoFlowApiKeyResponseDto })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.NOT_FOUND,
    ErrorCode.IDEMPOTENCY_KEY_REUSED,
  )
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @RequirePermission(Permission.BANK_CONNECTION_REVEAL_KEY)
  @Audited(
    AuditActionType.BANK_CONNECTION_API_KEY_REVEAL,
    AuditEntityType.CASSO_FLOW_AUTHORIZATION,
  )
  async revealApiKey(
    @Param('id') authorizationId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: RevealCassoFlowApiKeyDto,
    @Req() request: AuthRequest,
  ) {
    const userId = request.user?.userId;
    if (!userId) {
      throw new UnauthorizedException();
    }
    return this.idempotency.execute(
      `POST /bank-connections/authorizations/${authorizationId}/reveal-key`,
      key,
      dto,
      () =>
        this.revealCassoFlowApiKeyUseCase.execute({
          organizationId: this.tenantContext.getOrganizationId(),
          cassoFlowAuthorizationId: authorizationId,
          userId,
          password: dto.password,
        }),
    );
  }

  @Post(':id/disconnect')
  @ApiOperation({ summary: 'Disconnect a bank connection' })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiCreatedResponse({
    description: 'Connection disconnected',
    schema: successResponseSchema(),
  })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.NOT_FOUND,
    ErrorCode.IDEMPOTENCY_KEY_REUSED,
  )
  @RequirePermission(Permission.BANK_CONNECTION_MANAGE)
  @Audited(
    AuditActionType.BANK_CONNECTION_DISCONNECT,
    AuditEntityType.BANK_CONNECTION,
  )
  async disconnect(
    @Param('id') connectionId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthRequest,
  ) {
    const userId = request.user?.userId;
    if (!userId) {
      throw new UnauthorizedException();
    }
    return this.idempotency.execute(
      `POST /bank-connections/${connectionId}/disconnect`,
      key,
      { connectionId },
      async () => {
        await this.disconnectConnectionUseCase.execute(connectionId, userId);
        return { success: true };
      },
    );
  }

  @Get('authorizations/:id/audit-events')
  @ApiOperation({
    summary:
      "List a CassoFlowAuthorization's API Key history (audit events)",
  })
  @ApiOkResponse({ type: ListConnectionAuditEventsResponseDto })
  @ApiErrorResponse(ErrorCode.VALIDATION_ERROR, ErrorCode.NOT_FOUND)
  @RequirePermission(Permission.BANK_CONNECTION_REVEAL_KEY)
  async listAuditEvents(
    @Param('id') authorizationId: string,
    @Query() query: PaginationDto,
  ) {
    const result = await this.listAuthorizationAuditEventsUseCase.execute({
      organizationId: this.tenantContext.getOrganizationId(),
      cassoFlowAuthorizationId: authorizationId,
      page: query.page,
      limit: query.limit,
    });
    return {
      items: result.items.map(toConnectionAuditEventResponse),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }
}
