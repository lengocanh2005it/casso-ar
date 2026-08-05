import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Permission } from '../../../common/rbac/permission.enum';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import type { DisconnectConnectionUseCase } from '../application/disconnect-connection.usecase';
import type { ExchangeTokenUseCase } from '../application/exchange-token.usecase';
import type { InitiateConnectionUseCase } from '../application/initiate-connection.usecase';
import type { ExchangeTokenDto } from './dto/exchange-token.dto';
import type { InitiateConnectionDto } from './dto/initiate-connection.dto';

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
  ) {}

  @Post('cas-id/initiate')
  @RequirePermission(Permission.BANK_CONNECTION_MANAGE)
  async initiate(
    @Body() dto: InitiateConnectionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.initiateConnectionUseCase.execute({
      userId: request.user?.userId ?? '',
      redirectUri: dto.redirectUri,
      bankConnectionId: dto.bankConnectionId,
    });
  }

  @Post('cas-id/sessions/:id/exchange')
  @RequirePermission(Permission.BANK_CONNECTION_MANAGE)
  async exchange(
    @Param('id') sessionId: string,
    @Body() dto: ExchangeTokenDto,
  ) {
    const connection = await this.exchangeTokenUseCase.execute({
      sessionId,
      publicToken: dto.publicToken,
    });
    return { connectionId: connection.id, status: connection.status };
  }

  @Post(':id/disconnect')
  @RequirePermission(Permission.BANK_CONNECTION_MANAGE)
  async disconnect(@Param('id') connectionId: string) {
    await this.disconnectConnectionUseCase.execute(connectionId);
    return { success: true };
  }
}
