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
import { ErrorCode } from '../../../common/errors/error-code';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { ApiErrorResponse } from '../../../common/swagger/api-error-response.decorator';
import { DeleteSmtpConfigUseCase } from '../application/delete-smtp-config.usecase';
import { GetSmtpConfigUseCase } from '../application/get-smtp-config.usecase';
import { TestAndSaveSmtpConfigUseCase } from '../application/test-and-save-smtp-config.usecase';
import { SaveSmtpConfigDto } from './dto/save-smtp-config.dto';
import {
  SmtpConfigResponseDto,
  toSmtpConfigResponse,
} from './dto/smtp-config-response.dto';
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
  @ApiOperation({ summary: 'Get the organization SMTP config' })
  @ApiOkResponse({ type: SmtpConfigResponseDto })
  @ApiErrorResponse(ErrorCode.NOT_FOUND)
  @RequirePermission(Permission.ORGANIZATION_SMTP_MANAGE)
  async get() {
    const config = await this.getUseCase.execute();
    if (!config) throw new NotFoundException();
    return toSmtpConfigResponse(config);
  }

  @Post()
  @ApiOperation({ summary: 'Test and save the organization SMTP config' })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiCreatedResponse({ type: SmtpConfigResponseDto })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.NOT_FOUND,
    ErrorCode.FORBIDDEN,
    ErrorCode.SMTP_CONNECTION_FAILED,
    ErrorCode.RATE_LIMIT_EXCEEDED,
    ErrorCode.IDEMPOTENCY_KEY_REUSED,
  )
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
  @ApiOperation({ summary: 'Delete the organization SMTP config' })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiOkResponse({
    description: 'SMTP config deleted',
    schema: {
      type: 'object',
      properties: { success: { type: 'boolean', example: true } },
    },
  })
  @ApiErrorResponse(ErrorCode.IDEMPOTENCY_KEY_REUSED)
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
