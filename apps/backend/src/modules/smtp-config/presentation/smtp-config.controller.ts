import { Permission } from '@casso-ledger/shared-types';
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  AuditActionType,
  AuditEntityType,
} from '../../../common/audit/audit.enums';
import { Audited } from '../../../common/audit/audited.decorator';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { DeleteSmtpConfigUseCase } from '../application/delete-smtp-config.usecase';
import { GetSmtpConfigUseCase } from '../application/get-smtp-config.usecase';
import { TestAndSaveSmtpConfigUseCase } from '../application/test-and-save-smtp-config.usecase';
import { SaveSmtpConfigDto } from './dto/save-smtp-config.dto';
import { toSmtpConfigResponse } from './dto/smtp-config-response.dto';
import { SmtpConfigRateLimitGuard } from './smtp-config-rate-limit.guard';

@ApiTags('smtp-config')
@Controller('smtp-config')
@UseGuards(PermissionGuard)
export class SmtpConfigController {
  constructor(
    private readonly testAndSaveUseCase: TestAndSaveSmtpConfigUseCase,
    private readonly getUseCase: GetSmtpConfigUseCase,
    private readonly deleteUseCase: DeleteSmtpConfigUseCase,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Get()
  @RequirePermission(Permission.ORGANIZATION_SMTP_MANAGE)
  async get() {
    const config = await this.getUseCase.execute();
    if (!config) throw new NotFoundException();
    return toSmtpConfigResponse(config);
  }

  @Post()
  @UseGuards(SmtpConfigRateLimitGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Audited(AuditActionType.SMTP_CONFIG_SAVE, AuditEntityType.SMTP_CONFIG)
  @RequirePermission(Permission.ORGANIZATION_SMTP_MANAGE)
  async save(
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: SaveSmtpConfigDto,
  ) {
    return this.idempotency.execute('POST /smtp-config', key, dto, async () => {
      const config = await this.testAndSaveUseCase.execute(dto);
      return toSmtpConfigResponse(config);
    });
  }

  @Delete()
  @Audited(AuditActionType.SMTP_CONFIG_DELETE, AuditEntityType.SMTP_CONFIG)
  @RequirePermission(Permission.ORGANIZATION_SMTP_MANAGE)
  async remove(@Headers('idempotency-key') key: string | undefined) {
    return this.idempotency.execute(
      'DELETE /smtp-config',
      key,
      {},
      async () => {
        await this.deleteUseCase.execute();
        return { success: true };
      },
    );
  }
}
