import { Permission } from '@casso-ledger/shared-types';
import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  AuditActionType,
  AuditEntityType,
} from '../../../common/audit/audit.enums';
import { Audited } from '../../../common/audit/audited.decorator';
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
import { ListBankConnectionsUseCase } from '../application/list-bank-connections.usecase';
import {
  ListBankConnectionsResponseDto,
  toBankConnectionResponse,
} from './dto/bank-connection-response.dto';
import { ConnectCassoFlowDto } from './dto/connect-casso-flow.dto';

@ApiTags('bank-connections')
@Controller('bank-connections')
@UseGuards(PermissionGuard)
export class BankConnectionsController {
  constructor(
    private readonly listBankConnectionsUseCase: ListBankConnectionsUseCase,
    private readonly connectCassoFlowUseCase: ConnectCassoFlowUseCase,
    private readonly disconnectConnectionUseCase: DisconnectConnectionUseCase,
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

  @Post('casso-flow/connect')
  @ApiOperation({
    summary:
      "Connect this organization's Casso Flow account via a pasted API Key",
  })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiCreatedResponse({
    description: 'Connection created',
    schema: {
      type: 'object',
      required: ['connectionId', 'status'],
      properties: {
        connectionId: { type: 'string', format: 'uuid' },
        status: { type: 'string' },
      },
    },
  })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
    ErrorCode.IDEMPOTENCY_KEY_REUSED,
  )
  @RequirePermission(Permission.BANK_CONNECTION_MANAGE)
  @Audited(
    AuditActionType.BANK_CONNECTION_CREATE,
    AuditEntityType.BANK_CONNECTION,
  )
  async connect(
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: ConnectCassoFlowDto,
  ) {
    return this.idempotency.execute(
      'POST /bank-connections/casso-flow/connect',
      key,
      dto,
      async () => {
        const connection = await this.connectCassoFlowUseCase.execute({
          organizationId: this.tenantContext.getOrganizationId(),
          apiKey: dto.apiKey,
          bankConnectionId: dto.bankConnectionId,
        });
        return { connectionId: connection.id, status: connection.status };
      },
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
  ) {
    return this.idempotency.execute(
      `POST /bank-connections/${connectionId}/disconnect`,
      key,
      { connectionId },
      async () => {
        await this.disconnectConnectionUseCase.execute(connectionId);
        return { success: true };
      },
    );
  }
}
