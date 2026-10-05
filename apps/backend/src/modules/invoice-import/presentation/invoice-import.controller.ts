import { Permission } from '@casso-ar/shared-types';
import {
  BadRequestException,
  Controller,
  Headers,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { ErrorCode } from '../../../common/errors/error-code';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { ApiErrorResponse } from '../../../common/swagger/api-error-response.decorator';
import { ApiIdempotencyKey } from '../../../common/swagger/api-idempotency-key.decorator';
import { ImportInvoicesUseCase } from '../application/import-invoices.usecase';
import { getImportRequestFingerprint } from '../application/import-request-fingerprint';
import { ImportInvoicesResponseDto } from './dto/import-invoices-response.dto';

@ApiTags('invoice-import')
@Controller('invoices')
@UseGuards(PermissionGuard)
export class InvoiceImportController {
  constructor(
    private readonly importInvoicesUseCase: ImportInvoicesUseCase,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post('import')
  @ApiOperation({ summary: 'Import receivables from an uploaded CSV file' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'CSV file (multipart field "file", max 5 MB)',
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiIdempotencyKey()
  @ApiCreatedResponse({ type: ImportInvoicesResponseDto })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.CUSTOMER_MISMATCH,
    ErrorCode.CONFLICT,
    ErrorCode.FILE_TOO_LARGE,
    ErrorCode.IDEMPOTENCY_KEY_REUSED,
  )
  @RequirePermission(Permission.RECEIVABLE_IMPORT)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async import(
    @Headers('idempotency-key') key: string | undefined,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<ImportInvoicesResponseDto> {
    if (!file) throw new BadRequestException('File là bắt buộc.');

    const fileSha256 = getImportRequestFingerprint(
      file.buffer,
      file.originalname,
    );
    return this.idempotency.execute(
      'POST /invoices/import',
      key,
      { filename: file.originalname, fileSha256 },
      () => this.importInvoicesUseCase.execute(file.buffer, file.originalname),
    );
  }
}
