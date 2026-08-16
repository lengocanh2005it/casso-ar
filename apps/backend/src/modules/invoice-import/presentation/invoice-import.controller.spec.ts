import { Permission } from '@casso-ledger/shared-types';
import { ConflictException, type INestApplication } from '@nestjs/common';
import {
  GUARDS_METADATA,
  INTERCEPTORS_METADATA,
  MODULE_METADATA,
} from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AuditModule } from '../../../common/audit/audit.module';
import { AUDIT_LOG_REPOSITORY } from '../../../common/audit/audit-log-repository.port';
import { ErrorCode } from '../../../common/errors/error-code';
import { HttpExceptionFilter } from '../../../common/errors/http-exception.filter';
import { IdempotencyModule } from '../../../common/idempotency/idempotency.module';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service';
import { StructuredLogger } from '../../../common/logging/structured-logger';
import { JsonLogger } from '../../../common/observability/json-logger.service';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { REQUIRED_PERMISSION_KEY } from '../../../common/rbac/require-permission.decorator';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { CUSTOMER_REPOSITORY } from '../../customers/application/customer-repository.port';
import { CustomersModule } from '../../customers/customers.module';
import { INVOICE_REPOSITORY } from '../../invoices/application/invoice-repository.port';
import { InvoicesModule } from '../../invoices/invoices.module';
import { CreateReceivableUseCase } from '../../receivables/application/create-receivable.usecase';
import { RECEIVABLE_REPOSITORY } from '../../receivables/application/receivable-repository.port';
import { ReceivablesModule } from '../../receivables/receivables.module';
import { IMPORT_FILE_ROW_PARSER } from '../application/import-file-row-parser.port';
import {
  type ImportInvoicesResult,
  ImportInvoicesUseCase,
} from '../application/import-invoices.usecase';
import { getImportRequestFingerprint } from '../application/import-request-fingerprint';
import { parseFileToRows } from '../infrastructure/file-row-parser';
import { InvoiceImportModule } from '../invoice-import.module';
import { InvoiceImportController } from './invoice-import.controller';

describe('InvoiceImportController', () => {
  const result: ImportInvoicesResult = {
    totalRows: 2,
    successCount: 1,
    failedRows: [
      {
        rowNumber: 3,
        data: { invoiceNumber: 'INV-2' },
        errors: ['VALIDATION_ERROR'],
      },
    ],
  };

  let app: INestApplication;
  let importInvoicesUseCase: { execute: jest.Mock };
  let idempotency: { execute: jest.Mock };

  beforeEach(async () => {
    importInvoicesUseCase = { execute: jest.fn().mockResolvedValue(result) };
    idempotency = {
      execute: jest.fn(
        async (
          _endpoint: string,
          key: string | undefined,
          _metadata: unknown,
          operation: () => Promise<ImportInvoicesResult>,
        ) => {
          if (!key) {
            throw new ConflictException({
              errorCode: ErrorCode.VALIDATION_ERROR,
              message: 'Vui lòng cung cấp Idempotency-Key.',
            });
          }
          return operation();
        },
      ),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [InvoiceImportController],
      providers: [
        { provide: ImportInvoicesUseCase, useValue: importInvoicesUseCase },
        { provide: IdempotencyService, useValue: idempotency },
      ],
    })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(
      new HttpExceptionFilter({
        error: jest.fn(),
        warn: jest.fn(),
      } as unknown as JsonLogger),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns the standard 400 validation envelope when the file is missing', async () => {
    const response = await request(app.getHttpServer())
      .post('/invoices/import')
      .set('Idempotency-Key', 'import-1')
      .expect(400);

    expect(response.body).toEqual({
      statusCode: 400,
      errorCode: ErrorCode.VALIDATION_ERROR,
      message: 'Dữ liệu đầu vào không hợp lệ.',
    });
    expect(idempotency.execute).not.toHaveBeenCalled();
  });

  it('lets IdempotencyService reject a missing idempotency key', async () => {
    const response = await request(app.getHttpServer())
      .post('/invoices/import')
      .attach('file', Buffer.from('invoiceNumber\nINV-1\n'), 'invoices.csv')
      .expect(409);

    expect(response.body).toEqual({
      statusCode: 409,
      errorCode: ErrorCode.VALIDATION_ERROR,
      message: 'Vui lòng cung cấp Idempotency-Key.',
    });
    expect(importInvoicesUseCase.execute).not.toHaveBeenCalled();
  });

  it('requires RECEIVABLE_IMPORT permission', () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION_KEY,
        InvoiceImportController.prototype.import,
      ),
    ).toBe(Permission.RECEIVABLE_IMPORT);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, InvoiceImportController),
    ).toContain(PermissionGuard);
  });

  it('configures the multipart interceptor with a 5 MiB memory limit', () => {
    const [Interceptor] = Reflect.getMetadata(
      INTERCEPTORS_METADATA,
      InvoiceImportController.prototype.import,
    );
    const instance = new Interceptor();

    expect(instance.multer.storage.constructor.name).toBe('MemoryStorage');
    expect(instance.multer.limits.fileSize).toBe(5 * 1024 * 1024);
  });

  it('passes endpoint, filename, and file hash metadata to idempotency', async () => {
    const file = Buffer.from('invoiceNumber\nINV-1\n');

    await request(app.getHttpServer())
      .post('/invoices/import')
      .set('Idempotency-Key', 'import-1')
      .attach('file', file, 'invoices.csv')
      .expect(201);

    expect(idempotency.execute).toHaveBeenCalledWith(
      'POST /invoices/import',
      'import-1',
      {
        filename: 'invoices.csv',
        fileSha256: getImportRequestFingerprint(file, 'invoices.csv'),
      },
      expect.any(Function),
    );
  });

  it('returns the use-case result with HTTP 201 for a valid request', async () => {
    const response = await request(app.getHttpServer())
      .post('/invoices/import')
      .set('Idempotency-Key', 'import-1')
      .attach('file', Buffer.from('invoiceNumber\nINV-1\n'), 'invoices.csv')
      .expect(201);

    expect(response.body).toEqual(result);
    expect(importInvoicesUseCase.execute).toHaveBeenCalledWith(
      Buffer.from('invoiceNumber\nINV-1\n'),
      'invoices.csv',
    );
  });
});

describe('InvoiceImportModule', () => {
  it('wires dependencies without importing a duplicate AuditModule', async () => {
    expect(
      Reflect.getMetadata(MODULE_METADATA.IMPORTS, InvoiceImportModule),
    ).toEqual(
      expect.arrayContaining([
        CustomersModule,
        InvoicesModule,
        ReceivablesModule,
        IdempotencyModule,
      ]),
    );
    expect(
      Reflect.getMetadata(MODULE_METADATA.IMPORTS, InvoiceImportModule),
    ).not.toContain(AuditModule);

    const moduleRef = await Test.createTestingModule({
      controllers: [InvoiceImportController],
      providers: [
        ImportInvoicesUseCase,
        {
          provide: IMPORT_FILE_ROW_PARSER,
          useValue: { parseFileToRows },
        },
        { provide: CUSTOMER_REPOSITORY, useValue: {} },
        { provide: INVOICE_REPOSITORY, useValue: {} },
        { provide: RECEIVABLE_REPOSITORY, useValue: {} },
        { provide: CreateReceivableUseCase, useValue: { execute: jest.fn() } },
        { provide: TenantContextService, useValue: {} },
        { provide: DataSource, useValue: {} },
        { provide: AUDIT_LOG_REPOSITORY, useValue: {} },
        StructuredLogger,
        { provide: IdempotencyService, useValue: {} },
      ],
    }).compile();

    expect(moduleRef.get(InvoiceImportController)).toBeInstanceOf(
      InvoiceImportController,
    );
    expect(moduleRef.get(ImportInvoicesUseCase)).toBeInstanceOf(
      ImportInvoicesUseCase,
    );
    expect(moduleRef.get(IMPORT_FILE_ROW_PARSER)).toEqual({
      parseFileToRows,
    });
  });
});
