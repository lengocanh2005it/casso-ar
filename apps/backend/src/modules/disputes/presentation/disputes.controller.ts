import { Permission } from '@casso-ledger/shared-types';
import {
  Body,
  Controller,
  Headers,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  AuditActionType,
  AuditEntityType,
} from '../../../common/audit/audit.enums';
import { Audited } from '../../../common/audit/audited.decorator';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { OpenDisputeUseCase } from '../application/open-dispute.usecase';
import { ResolveDisputeUseCase } from '../application/resolve-dispute.usecase';
import { toDisputeResponse } from './dto/dispute-response.dto';
import { OpenDisputeDto } from './dto/open-dispute.dto';

@ApiTags('disputes')
@Controller()
@UseGuards(PermissionGuard)
export class DisputesController {
  constructor(
    private readonly openDisputeUseCase: OpenDisputeUseCase,
    private readonly resolveDisputeUseCase: ResolveDisputeUseCase,
    private readonly tenantContext: TenantContextService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post('receivables/:receivableId/disputes')
  @Audited(AuditActionType.DISPUTE_OPEN, AuditEntityType.DISPUTE)
  @RequirePermission(Permission.RECEIVABLE_DISPUTE)
  async open(
    @Param('receivableId') receivableId: string,
    @Body() dto: OpenDisputeDto,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    const user = this.getCurrentUser();
    return this.idempotency.execute(
      `POST /receivables/${receivableId}/disputes`,
      key,
      { receivableId, ...dto },
      async () =>
        toDisputeResponse(
          await this.openDisputeUseCase.execute({
            receivableId,
            reason: dto.reason,
            openedByUserId: user.userId,
          }),
        ),
    );
  }

  @Post('disputes/:id/resolve')
  @Audited(AuditActionType.DISPUTE_RESOLVE, AuditEntityType.DISPUTE)
  @RequirePermission(Permission.RECEIVABLE_DISPUTE)
  async resolve(
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    const user = this.getCurrentUser();
    return this.idempotency.execute(
      `POST /disputes/${id}/resolve`,
      key,
      { id },
      async () =>
        toDisputeResponse(
          await this.resolveDisputeUseCase.execute({
            disputeId: id,
            resolvedByUserId: user.userId,
          }),
        ),
    );
  }

  private getCurrentUser() {
    const user = this.tenantContext.getCurrentUser();
    if (!user) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Yêu cầu đăng nhập.');
    }
    return user;
  }
}
