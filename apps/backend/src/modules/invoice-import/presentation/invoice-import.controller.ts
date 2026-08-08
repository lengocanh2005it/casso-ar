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
import { memoryStorage } from 'multer';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service';
import { Permission } from '../../../common/rbac/permission.enum';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import {
  type ImportInvoicesResult,
  ImportInvoicesUseCase,
} from '../application/import-invoices.usecase';
import { getImportRequestFingerprint } from '../application/import-request-fingerprint';

@Controller('invoices')
@UseGuards(PermissionGuard)
export class InvoiceImportController {
  constructor(
    private readonly importInvoicesUseCase: ImportInvoicesUseCase,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post('import')
  @RequirePermission(Permission.RECEIVABLE_WRITE)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async import(
    @Headers('idempotency-key') key: string | undefined,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<ImportInvoicesResult> {
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
