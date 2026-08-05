import {
  Body,
  Controller,
  Headers,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service';
import { Permission } from '../../../common/rbac/permission.enum';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { DisconnectConnectionUseCase } from '../application/disconnect-connection.usecase';
import { ExchangeTokenUseCase } from '../application/exchange-token.usecase';
import { InitiateConnectionUseCase } from '../application/initiate-connection.usecase';
import { ExchangeTokenDto } from './dto/exchange-token.dto';
import { InitiateConnectionDto } from './dto/initiate-connection.dto';

interface AuthenticatedRequest extends Request {
  user?: { userId: string };
}

@Controller('bank-connections')
@UseGuards(PermissionGuard)
export class BankConnectionsController {
  constructor(
    private readonly initiateConnectionUseCase: InitiateConnectionUseCase,
    private readonly exchangeTokenUseCase: ExchangeTokenUseCase,
    private readonly disconnectConnectionUseCase: DisconnectConnectionUseCase,
    private readonly idempotency: IdempotencyService,
  ) {}

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
      () =>
        this.initiateConnectionUseCase.execute({
          userId: request.user?.userId ?? '',
          redirectUri: dto.redirectUri,
          bankConnectionId: dto.bankConnectionId,
        }),
    );
  }

  @Post('cas-id/sessions/:id/exchange')
  @RequirePermission(Permission.BANK_CONNECTION_MANAGE)
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
