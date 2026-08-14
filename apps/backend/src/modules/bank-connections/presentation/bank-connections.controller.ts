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
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  AuditActionType,
  AuditEntityType,
} from '../../../common/audit/audit.enums';
import { Audited } from '../../../common/audit/audited.decorator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { DisconnectConnectionUseCase } from '../application/disconnect-connection.usecase';
import { ExchangeTokenUseCase } from '../application/exchange-token.usecase';
import { InitiateConnectionUseCase } from '../application/initiate-connection.usecase';
import { ListBankConnectionsUseCase } from '../application/list-bank-connections.usecase';
import { toBankConnectionResponse } from './dto/bank-connection-response.dto';
import { ExchangeTokenDto } from './dto/exchange-token.dto';
import { InitiateConnectionDto } from './dto/initiate-connection.dto';

interface AuthenticatedRequest extends Request {
  user?: { userId: string };
}

@ApiTags('bank-connections')
@Controller('bank-connections')
@UseGuards(PermissionGuard)
export class BankConnectionsController {
  constructor(
    private readonly listBankConnectionsUseCase: ListBankConnectionsUseCase,
    private readonly initiateConnectionUseCase: InitiateConnectionUseCase,
    private readonly exchangeTokenUseCase: ExchangeTokenUseCase,
    private readonly disconnectConnectionUseCase: DisconnectConnectionUseCase,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Get()
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

  @Post('cas-id/initiate')
  @RequirePermission(Permission.BANK_CONNECTION_MANAGE)
  async initiate(
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: InitiateConnectionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.idempotency.execute(
      'POST /bank-connections/cas-id/initiate',
      key,
      dto,
      () => {
        const userId = request.user?.userId;
        if (!userId) {
          throw new UnauthorizedException();
        }
        return this.initiateConnectionUseCase.execute({
          userId,
          redirectUri: dto.redirectUri,
          bankConnectionId: dto.bankConnectionId,
        });
      },
    );
  }

  @Post('cas-id/sessions/:id/exchange')
  @RequirePermission(Permission.BANK_CONNECTION_MANAGE)
  @Audited(
    AuditActionType.BANK_CONNECTION_CREATE,
    AuditEntityType.BANK_CONNECTION,
  )
  async exchange(
    @Param('id') sessionId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: ExchangeTokenDto,
  ) {
    return this.idempotency.execute(
      `POST /bank-connections/cas-id/sessions/${sessionId}/exchange`,
      key,
      dto,
      async () => {
        const connection = await this.exchangeTokenUseCase.execute({
          sessionId,
          publicToken: dto.publicToken,
        });
        return { connectionId: connection.id, status: connection.status };
      },
    );
  }

  @Post(':id/disconnect')
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
