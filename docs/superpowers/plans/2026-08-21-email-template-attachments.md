# Email Template Attachments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a business attach files (PDF/PNG/JPG/JPEG) to a saved `EmailTemplate` so every reminder sent with that template carries them as downloadable attachments, with images optionally inline via `cid:<filename>` in the template's `bodyHtml`.

**Architecture:** Attachments are metadata rows (`email_template_attachments`) pointing at files on local disk (`uploads/email-template-attachments/<organizationId>/<emailTemplateId>/<uuid>.<ext>`), scoped by `organizationId` and `emailTemplateId`. Upload/delete are new endpoints on the existing `email-templates` module, reusing its `REMINDER_POLICY_WRITE` permission. `EmailService.sendReminderEmail` enqueues only attachment *references* (storageKey/filename/mimeType) in `ReminderEmailJob` — never base64 content — and `EmailQueueProcessor` re-validates each file exists, reads it, base64-encodes it, and marks it inline (`contentId = filename`) only when `bodyHtml` contains `cid:<filename>`, right before calling the Resend/SMTP adapter (both already accept `EmailAttachment[]`).

**Tech Stack:** NestJS 11, TypeORM 1.1, `@nestjs/platform-express` `FileInterceptor` (existing pattern from `invoice-import.controller.ts`), Node `node:fs`/`node:path`/`node:crypto`, Jest 30, React 19 + TanStack Query (frontend upload UI).

**Spec:** [docs/superpowers/specs/2026-08-21-email-template-attachments-design.md](../specs/2026-08-21-email-template-attachments-design.md) — the grilled design (issue #275, grilled 2026-08-21). This plan's Global Constraints section below restates it for convenience during execution.

**Worktree:** `C:\Users\PC ASUS\orca\workspaces\casso-ledger\feat-275-email-attachments`, branch `lengocanh2005it/feat-275-email-attachments`. Run every command below from that directory (already has `apps/backend/.env` copied and `pnpm install` run).

## Global Constraints

- Attachments belong to a saved `EmailTemplate`, not a one-off send — every reminder sent with that template automatically carries its attachments.
- Limits (hardcoded constants, not per-org config): max 5 files per template, max 10MB per file, max 25MB total per template.
- Allowed types this phase: `application/pdf`, `image/png`, `image/jpeg` only. DOCX/XLSX are an explicit follow-up, not in scope.
- Inline images: author writes `<img src="cid:original-filename.png">` directly in `bodyHtml`. No new Handlebars helper. At send time, an attachment is inline (`contentId` set) iff its `filename` appears as `cid:<filename>` in the rendered `bodyHtml`; otherwise it is a normal downloadable attachment. No `isInline` column.
- Storage: local disk, under a Docker Compose volume shared between the API and worker containers. No S3/MinIO.
- On-disk filenames are randomly generated (`randomUUID() + ext`) — never the original filename — to avoid path traversal / overwrite. The original `filename` is stored only as DB metadata (used for the download name and the `cid:` match).
- `ReminderEmailJob` carries attachment *references* (storageKey/filename/mimeType), never base64 content, to avoid bloating the BullMQ/Redis job payload.
- The email worker (`EmailQueueProcessor`) re-validates that each referenced file still exists before sending (mirrors ADR-0004's scan/re-check split already used for reminder executions).
- Attachments persist until the template is deleted (cascade-deletes files + rows) or the business removes one explicitly — not deleted per-send.
- No new `ErrorCode` for invalid-type/oversize: reuse `ErrorCode.VALIDATION_ERROR` (400, matches `upload-avatar.usecase.ts` precedent) for invalid MIME/oversize/limit-exceeded, and `ErrorCode.FILE_TOO_LARGE` (413, existing) is reserved for the Multer-level hard cap. One new code: `ErrorCode.ATTACHMENT_NOT_FOUND` (404), matching the `RECEIVABLE_NOT_FOUND`/`PAYMENT_NOT_FOUND` per-entity convention.
- No new RBAC permission — upload/delete reuse `Permission.REMINDER_POLICY_WRITE` (same as create/update/delete template), read implicitly covered by the template's own read permission.
- Response DTOs never expose `storageKey` (physical path) or `organizationId` — only `id`, `filename`, `mimeType`, `sizeBytes`, `createdAt`.
- Branding rule (existing, unaffected): organization → customer emails never get the Casso Ledger logo auto-attached. Nothing in this plan attaches a logo; verified by not touching `buildCassoEmail`/logo logic.

---

### Task 1: Domain entity — `EmailTemplateAttachment`

**Files:**
- Create: `apps/backend/src/modules/email-templates/domain/email-template-attachment.ts`
- Test: `apps/backend/src/modules/email-templates/domain/email-template-attachment.spec.ts`

**Interfaces:**
- Produces: `EmailTemplateAttachment` class, `EmailTemplateAttachmentProps` interface — both consumed by Task 3 (repository), Task 5 (upload use case), Task 6 (delete use case), Task 9 (cascade delete), Task 10 (EmailService).

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/modules/email-templates/domain/email-template-attachment.spec.ts
import { EmailTemplateAttachment } from './email-template-attachment';

describe('EmailTemplateAttachment', () => {
  it('holds the fields needed to store, download, and inline-reference a file', () => {
    const createdAt = new Date('2026-08-21T00:00:00.000Z');
    const attachment = new EmailTemplateAttachment({
      id: 'att-1',
      organizationId: 'org-1',
      emailTemplateId: 'tpl-1',
      filename: 'invoice.pdf',
      storageKey: 'org-1/tpl-1/uuid-generated.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 12345,
      createdAt,
    });

    expect(attachment.id).toBe('att-1');
    expect(attachment.organizationId).toBe('org-1');
    expect(attachment.emailTemplateId).toBe('tpl-1');
    expect(attachment.filename).toBe('invoice.pdf');
    expect(attachment.storageKey).toBe('org-1/tpl-1/uuid-generated.pdf');
    expect(attachment.mimeType).toBe('application/pdf');
    expect(attachment.sizeBytes).toBe(12345);
    expect(attachment.createdAt).toBe(createdAt);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern email-template-attachment.spec.ts`
Expected: FAIL — `Cannot find module './email-template-attachment'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/modules/email-templates/domain/email-template-attachment.ts
export interface EmailTemplateAttachmentProps {
  id: string;
  organizationId: string;
  emailTemplateId: string;
  filename: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
}

export class EmailTemplateAttachment {
  readonly id: string;
  readonly organizationId: string;
  readonly emailTemplateId: string;
  readonly filename: string;
  readonly storageKey: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly createdAt: Date;

  constructor(props: EmailTemplateAttachmentProps) {
    this.id = props.id;
    this.organizationId = props.organizationId;
    this.emailTemplateId = props.emailTemplateId;
    this.filename = props.filename;
    this.storageKey = props.storageKey;
    this.mimeType = props.mimeType;
    this.sizeBytes = props.sizeBytes;
    this.createdAt = props.createdAt;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern email-template-attachment.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/email-templates/domain/email-template-attachment.ts apps/backend/src/modules/email-templates/domain/email-template-attachment.spec.ts
git commit -m "feat: add EmailTemplateAttachment domain entity"
```

---

### Task 2: Migration — `email_template_attachments` table

**Files:**
- Create: `apps/backend/src/database/migrations/20260821000000-add-email-template-attachments-table.ts`

**Interfaces:**
- Consumes: none.
- Produces: `email_template_attachments` table (columns: `id`, `organizationId`, `emailTemplateId`, `filename`, `storageKey`, `mimeType`, `sizeBytes`, `createdAt`) — consumed by Task 3's ORM entity, which must match column-for-column.

This task has no unit test — migrations are exempt from TDD per `AGENTS.md` ("Exceptions: generated code, configuration-only changes, migrations"). Verification is running the migration against the dev Postgres in Task 3.

- [ ] **Step 1: Write the migration**

```typescript
// apps/backend/src/database/migrations/20260821000000-add-email-template-attachments-table.ts
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmailTemplateAttachmentsTable20260821000000
  implements MigrationInterface
{
  name = 'AddEmailTemplateAttachmentsTable20260821000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "email_template_attachments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "organizationId" character varying NOT NULL,
        "emailTemplateId" character varying NOT NULL,
        "filename" character varying NOT NULL,
        "storageKey" character varying NOT NULL,
        "mimeType" character varying NOT NULL,
        "sizeBytes" integer NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT "PK_email_template_attachments" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_email_template_attachments_organization" ON "email_template_attachments" ("organizationId")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_email_template_attachments_template" ON "email_template_attachments" ("emailTemplateId")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_email_template_attachments_template"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_email_template_attachments_organization"',
    );
    await queryRunner.query(
      'DROP TABLE IF EXISTS "email_template_attachments"',
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/backend/src/database/migrations/20260821000000-add-email-template-attachments-table.ts
git commit -m "chore: add email_template_attachments migration"
```

---

### Task 3: ORM entity + repository port + TypeORM repository

**Files:**
- Create: `apps/backend/src/modules/email-templates/infrastructure/email-template-attachment.orm-entity.ts`
- Create: `apps/backend/src/modules/email-templates/application/email-template-attachment-repository.port.ts`
- Create: `apps/backend/src/modules/email-templates/infrastructure/typeorm-email-template-attachment.repository.ts`
- Test: `apps/backend/src/modules/email-templates/infrastructure/typeorm-email-template-attachment.repository.spec.ts`

**Interfaces:**
- Consumes: `EmailTemplateAttachment`/`EmailTemplateAttachmentProps` (Task 1), `BaseRepository` (`common/tenancy/base.repository.ts`, existing).
- Produces: `IEmailTemplateAttachmentRepository` (`findById(id): Promise<EmailTemplateAttachment | null>`, `findAllByTemplateId(emailTemplateId): Promise<EmailTemplateAttachment[]>`, `save(attachment, manager?): Promise<void>`, `delete(id): Promise<void>`, `deleteAllByTemplateId(emailTemplateId): Promise<void>`), `EMAIL_TEMPLATE_ATTACHMENT_REPOSITORY` token, `TypeOrmEmailTemplateAttachmentRepository` class — consumed by Task 5, 6, 9, 10.

- [ ] **Step 1: Write the ORM entity (no test — mirrors `EmailTemplateOrmEntity`'s untested column mapping)**

```typescript
// apps/backend/src/modules/email-templates/infrastructure/email-template-attachment.orm-entity.ts
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'email_template_attachments' })
@Index(['organizationId'])
@Index(['emailTemplateId'])
export class EmailTemplateAttachmentOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  organizationId: string;

  @Column({ type: 'varchar' })
  emailTemplateId: string;

  @Column({ type: 'varchar' })
  filename: string;

  @Column({ type: 'varchar' })
  storageKey: string;

  @Column({ type: 'varchar' })
  mimeType: string;

  @Column({ type: 'integer' })
  sizeBytes: number;

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}
```

- [ ] **Step 2: Write the repository port**

```typescript
// apps/backend/src/modules/email-templates/application/email-template-attachment-repository.port.ts
import type { EntityManager } from 'typeorm';
import type { EmailTemplateAttachment } from '../domain/email-template-attachment';

export interface IEmailTemplateAttachmentRepository {
  findById(id: string): Promise<EmailTemplateAttachment | null>;
  findAllByTemplateId(
    emailTemplateId: string,
  ): Promise<EmailTemplateAttachment[]>;
  save(
    attachment: EmailTemplateAttachment,
    manager?: EntityManager,
  ): Promise<void>;
  delete(id: string): Promise<void>;
  deleteAllByTemplateId(emailTemplateId: string): Promise<void>;
}

export const EMAIL_TEMPLATE_ATTACHMENT_REPOSITORY = Symbol(
  'EMAIL_TEMPLATE_ATTACHMENT_REPOSITORY',
);
```

- [ ] **Step 3: Write the failing repository test**

```typescript
// apps/backend/src/modules/email-templates/infrastructure/typeorm-email-template-attachment.repository.spec.ts
import { EmailTemplateAttachment } from '../domain/email-template-attachment';
import { TypeOrmEmailTemplateAttachmentRepository } from './typeorm-email-template-attachment.repository';

function buildAttachment(): EmailTemplateAttachment {
  return new EmailTemplateAttachment({
    id: 'att-1',
    organizationId: 'org-1',
    emailTemplateId: 'tpl-1',
    filename: 'invoice.pdf',
    storageKey: 'org-1/tpl-1/uuid.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 12345,
    createdAt: new Date('2026-08-21'),
  });
}

describe('TypeOrmEmailTemplateAttachmentRepository', () => {
  it('scopes findAllByTemplateId by organizationId via BaseRepository', async () => {
    const ormRepo = { find: jest.fn().mockResolvedValue([]) };
    const tenantContext = { getOrganizationId: () => 'org-1' };
    const repo = new TypeOrmEmailTemplateAttachmentRepository(
      ormRepo as any,
      tenantContext as any,
    );

    await repo.findAllByTemplateId('tpl-1');

    expect(ormRepo.find).toHaveBeenCalledWith({
      where: { emailTemplateId: 'tpl-1', organizationId: 'org-1' },
    });
  });

  it('maps EmailTemplateAttachment to the ORM shape on save', async () => {
    const ormRepo = { save: jest.fn() };
    const tenantContext = { getOrganizationId: () => 'org-1' };
    const repo = new TypeOrmEmailTemplateAttachmentRepository(
      ormRepo as any,
      tenantContext as any,
    );
    const attachment = buildAttachment();

    await repo.save(attachment);

    expect(ormRepo.save).toHaveBeenCalledWith({
      id: 'att-1',
      organizationId: 'org-1',
      emailTemplateId: 'tpl-1',
      filename: 'invoice.pdf',
      storageKey: 'org-1/tpl-1/uuid.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 12345,
      createdAt: attachment.createdAt,
    });
  });

  it('scopes deleteAllByTemplateId by organizationId', async () => {
    const ormRepo = { delete: jest.fn() };
    const tenantContext = { getOrganizationId: () => 'org-1' };
    const repo = new TypeOrmEmailTemplateAttachmentRepository(
      ormRepo as any,
      tenantContext as any,
    );

    await repo.deleteAllByTemplateId('tpl-1');

    expect(ormRepo.delete).toHaveBeenCalledWith({
      emailTemplateId: 'tpl-1',
      organizationId: 'org-1',
    });
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx jest --testPathPattern typeorm-email-template-attachment.repository.spec.ts`
Expected: FAIL — `Cannot find module './typeorm-email-template-attachment.repository'`

- [ ] **Step 5: Write minimal implementation**

```typescript
// apps/backend/src/modules/email-templates/infrastructure/typeorm-email-template-attachment.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, FindOptionsWhere, Repository } from 'typeorm';
import { BaseRepository } from '../../../common/tenancy/base.repository';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { IEmailTemplateAttachmentRepository } from '../application/email-template-attachment-repository.port';
import { EmailTemplateAttachment } from '../domain/email-template-attachment';
import { EmailTemplateAttachmentOrmEntity } from './email-template-attachment.orm-entity';

function toOrm(
  attachment: EmailTemplateAttachment,
): EmailTemplateAttachmentOrmEntity {
  return {
    id: attachment.id,
    organizationId: attachment.organizationId,
    emailTemplateId: attachment.emailTemplateId,
    filename: attachment.filename,
    storageKey: attachment.storageKey,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    createdAt: attachment.createdAt,
  };
}

@Injectable()
export class TypeOrmEmailTemplateAttachmentRepository
  extends BaseRepository<EmailTemplateAttachmentOrmEntity>
  implements IEmailTemplateAttachmentRepository
{
  constructor(
    @InjectRepository(EmailTemplateAttachmentOrmEntity)
    repo: Repository<EmailTemplateAttachmentOrmEntity>,
    tenantContext: TenantContextService,
  ) {
    super(repo, tenantContext);
  }

  async findById(id: string): Promise<EmailTemplateAttachment | null> {
    const row = await this.scopedFindOne({
      id,
    } as FindOptionsWhere<EmailTemplateAttachmentOrmEntity>);
    return row ? new EmailTemplateAttachment(row) : null;
  }

  async findAllByTemplateId(
    emailTemplateId: string,
  ): Promise<EmailTemplateAttachment[]> {
    const rows = await this.scopedFindMany({
      emailTemplateId,
    } as FindOptionsWhere<EmailTemplateAttachmentOrmEntity>);
    return rows.map((row) => new EmailTemplateAttachment(row));
  }

  async save(
    attachment: EmailTemplateAttachment,
    manager?: EntityManager,
  ): Promise<void> {
    await this.scopedSaveWithManager(toOrm(attachment), manager);
  }

  async delete(id: string): Promise<void> {
    await this.scopedDelete({
      id,
    } as FindOptionsWhere<EmailTemplateAttachmentOrmEntity>);
  }

  async deleteAllByTemplateId(emailTemplateId: string): Promise<void> {
    await this.scopedDelete({
      emailTemplateId,
    } as FindOptionsWhere<EmailTemplateAttachmentOrmEntity>);
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx jest --testPathPattern typeorm-email-template-attachment.repository.spec.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/email-templates/infrastructure/email-template-attachment.orm-entity.ts apps/backend/src/modules/email-templates/application/email-template-attachment-repository.port.ts apps/backend/src/modules/email-templates/infrastructure/typeorm-email-template-attachment.repository.ts apps/backend/src/modules/email-templates/infrastructure/typeorm-email-template-attachment.repository.spec.ts
git commit -m "feat: add EmailTemplateAttachment repository"
```

---

### Task 4: Attachment limits + local disk storage adapter

**Files:**
- Create: `apps/backend/src/modules/email-templates/application/attachment-limits.ts`
- Create: `apps/backend/src/modules/email-templates/application/attachment-storage.port.ts`
- Create: `apps/backend/src/modules/email-templates/infrastructure/local-disk-attachment-storage.adapter.ts`
- Test: `apps/backend/src/modules/email-templates/infrastructure/local-disk-attachment-storage.adapter.spec.ts`

**Interfaces:**
- Consumes: `node:fs`, `node:path`, `node:crypto` (builtins only).
- Produces: `ALLOWED_ATTACHMENT_MIME_TYPES`, `MAX_ATTACHMENT_COUNT`, `MAX_ATTACHMENT_SIZE_BYTES`, `MAX_TOTAL_ATTACHMENT_SIZE_BYTES` (consumed by Task 5's controller `FileInterceptor` limit and upload use case); `IAttachmentStorage` (`save(organizationId, emailTemplateId, originalFilename, buffer): Promise<string>` returns storageKey, `read(storageKey): Promise<Buffer>`, `exists(storageKey): Promise<boolean>`, `delete(storageKey): Promise<void>`), `ATTACHMENT_STORAGE` token — consumed by Task 5, 6, 9, 11.

- [ ] **Step 1: Write the limits constants (no test — plain constants)**

```typescript
// apps/backend/src/modules/email-templates/application/attachment-limits.ts
export const ALLOWED_ATTACHMENT_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
] as const;

export const MAX_ATTACHMENT_COUNT = 5;
export const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_TOTAL_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024;
```

- [ ] **Step 2: Write the storage port**

```typescript
// apps/backend/src/modules/email-templates/application/attachment-storage.port.ts
export interface IAttachmentStorage {
  save(
    organizationId: string,
    emailTemplateId: string,
    originalFilename: string,
    buffer: Buffer,
  ): Promise<string>;
  read(storageKey: string): Promise<Buffer>;
  exists(storageKey: string): Promise<boolean>;
  delete(storageKey: string): Promise<void>;
}

export const ATTACHMENT_STORAGE = Symbol('ATTACHMENT_STORAGE');
```

- [ ] **Step 3: Write the failing storage adapter test**

```typescript
// apps/backend/src/modules/email-templates/infrastructure/local-disk-attachment-storage.adapter.spec.ts
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { LocalDiskAttachmentStorage } from './local-disk-attachment-storage.adapter';

describe('LocalDiskAttachmentStorage', () => {
  let baseDir: string;
  let storage: LocalDiskAttachmentStorage;

  beforeEach(() => {
    baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'attachment-storage-'));
    storage = new LocalDiskAttachmentStorage(baseDir);
  });

  afterEach(() => {
    fs.rmSync(baseDir, { recursive: true, force: true });
  });

  it('saves the file under an org/template-scoped path with a random filename, not the original', async () => {
    const storageKey = await storage.save(
      'org-1',
      'tpl-1',
      'invoice.pdf',
      Buffer.from('pdf-bytes'),
    );

    expect(storageKey.startsWith(path.join('org-1', 'tpl-1'))).toBe(true);
    expect(storageKey.endsWith('.pdf')).toBe(true);
    expect(storageKey).not.toContain('invoice.pdf');
    expect(fs.existsSync(path.join(baseDir, storageKey))).toBe(true);
  });

  it('round-trips content through save/read', async () => {
    const storageKey = await storage.save(
      'org-1',
      'tpl-1',
      'logo.png',
      Buffer.from('png-bytes'),
    );

    const read = await storage.read(storageKey);

    expect(read.toString()).toBe('png-bytes');
  });

  it('reports exists() correctly before and after delete()', async () => {
    const storageKey = await storage.save(
      'org-1',
      'tpl-1',
      'logo.png',
      Buffer.from('png-bytes'),
    );

    expect(await storage.exists(storageKey)).toBe(true);
    await storage.delete(storageKey);
    expect(await storage.exists(storageKey)).toBe(false);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx jest --testPathPattern local-disk-attachment-storage.adapter.spec.ts`
Expected: FAIL — `Cannot find module './local-disk-attachment-storage.adapter'`

- [ ] **Step 5: Write minimal implementation**

```typescript
// apps/backend/src/modules/email-templates/infrastructure/local-disk-attachment-storage.adapter.ts
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Injectable } from '@nestjs/common';
import type { IAttachmentStorage } from '../application/attachment-storage.port';

const DEFAULT_BASE_DIR = path.resolve('uploads/email-template-attachments');

@Injectable()
export class LocalDiskAttachmentStorage implements IAttachmentStorage {
  constructor(private readonly baseDir: string = DEFAULT_BASE_DIR) {}

  async save(
    organizationId: string,
    emailTemplateId: string,
    originalFilename: string,
    buffer: Buffer,
  ): Promise<string> {
    const dir = path.join(organizationId, emailTemplateId);
    const absoluteDir = path.join(this.baseDir, dir);
    fs.mkdirSync(absoluteDir, { recursive: true });

    const ext = path.extname(originalFilename) || '';
    const generatedName = `${randomUUID()}${ext}`;
    const storageKey = path.join(dir, generatedName);
    fs.writeFileSync(path.join(this.baseDir, storageKey), buffer);
    return storageKey;
  }

  async read(storageKey: string): Promise<Buffer> {
    return fs.readFileSync(path.join(this.baseDir, storageKey));
  }

  async exists(storageKey: string): Promise<boolean> {
    return fs.existsSync(path.join(this.baseDir, storageKey));
  }

  async delete(storageKey: string): Promise<void> {
    const absolutePath = path.join(this.baseDir, storageKey);
    if (fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
    }
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx jest --testPathPattern local-disk-attachment-storage.adapter.spec.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/email-templates/application/attachment-limits.ts apps/backend/src/modules/email-templates/application/attachment-storage.port.ts apps/backend/src/modules/email-templates/infrastructure/local-disk-attachment-storage.adapter.ts apps/backend/src/modules/email-templates/infrastructure/local-disk-attachment-storage.adapter.spec.ts
git commit -m "feat: add local disk attachment storage adapter"
```

---

### Task 5: Upload use case

**Files:**
- Create: `apps/backend/src/modules/email-templates/application/upload-email-template-attachment.usecase.ts`
- Test: `apps/backend/src/modules/email-templates/application/upload-email-template-attachment.usecase.spec.ts`

**Interfaces:**
- Consumes: `IEmailTemplateRepository.findById` (existing), `IEmailTemplateAttachmentRepository.findAllByTemplateId`/`.save` (Task 3), `IAttachmentStorage.save` (Task 4), `ALLOWED_ATTACHMENT_MIME_TYPES`/`MAX_ATTACHMENT_COUNT`/`MAX_ATTACHMENT_SIZE_BYTES`/`MAX_TOTAL_ATTACHMENT_SIZE_BYTES` (Task 4), `TenantContextService.getOrganizationId()` (existing), `AppError`/`ErrorCode` (existing).
- Produces: `UploadEmailTemplateAttachmentUseCase.execute(input: { emailTemplateId: string; originalFilename: string; mimeType: string; sizeBytes: number; buffer: Buffer }): Promise<EmailTemplateAttachment>` — consumed by Task 7's controller.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/modules/email-templates/application/upload-email-template-attachment.usecase.spec.ts
import { EmailTemplate } from '../domain/email-template';
import { UploadEmailTemplateAttachmentUseCase } from './upload-email-template-attachment.usecase';

function buildTemplate(): EmailTemplate {
  return new EmailTemplate({
    id: 'tpl-1',
    organizationId: 'org-1',
    name: 'x',
    subject: 'x',
    bodyHtml: 'x',
    reminderStage: null,
    isDefault: false,
    createdAt: new Date('2026-08-01'),
    updatedAt: new Date('2026-08-01'),
    version: 1,
  });
}

function buildDeps(overrides?: {
  existingAttachments?: Array<{ sizeBytes: number }>;
}) {
  const templateRepo = { findById: jest.fn().mockResolvedValue(buildTemplate()) };
  const attachmentRepo = {
    findAllByTemplateId: jest
      .fn()
      .mockResolvedValue(overrides?.existingAttachments ?? []),
    save: jest.fn(),
  };
  const storage = { save: jest.fn().mockResolvedValue('org-1/tpl-1/uuid.pdf') };
  const tenantContext = { getOrganizationId: () => 'org-1' };
  return { templateRepo, attachmentRepo, storage, tenantContext };
}

describe('UploadEmailTemplateAttachmentUseCase', () => {
  it('rejects a disallowed MIME type without touching storage', async () => {
    const deps = buildDeps();
    const useCase = new UploadEmailTemplateAttachmentUseCase(
      deps.templateRepo as any,
      deps.attachmentRepo as any,
      deps.storage as any,
      deps.tenantContext as any,
    );

    await expect(
      useCase.execute({
        emailTemplateId: 'tpl-1',
        originalFilename: 'resume.docx',
        mimeType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        sizeBytes: 1000,
        buffer: Buffer.from('x'),
      }),
    ).rejects.toThrow('Định dạng file không hợp lệ');
    expect(deps.storage.save).not.toHaveBeenCalled();
  });

  it('rejects a file over the 10MB per-file limit', async () => {
    const deps = buildDeps();
    const useCase = new UploadEmailTemplateAttachmentUseCase(
      deps.templateRepo as any,
      deps.attachmentRepo as any,
      deps.storage as any,
      deps.tenantContext as any,
    );

    await expect(
      useCase.execute({
        emailTemplateId: 'tpl-1',
        originalFilename: 'big.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 11 * 1024 * 1024,
        buffer: Buffer.from('x'),
      }),
    ).rejects.toThrow('File quá lớn');
    expect(deps.storage.save).not.toHaveBeenCalled();
  });

  it('rejects a 6th file once the template already has 5 attachments', async () => {
    const deps = buildDeps({
      existingAttachments: [
        { sizeBytes: 1 },
        { sizeBytes: 1 },
        { sizeBytes: 1 },
        { sizeBytes: 1 },
        { sizeBytes: 1 },
      ],
    });
    const useCase = new UploadEmailTemplateAttachmentUseCase(
      deps.templateRepo as any,
      deps.attachmentRepo as any,
      deps.storage as any,
      deps.tenantContext as any,
    );

    await expect(
      useCase.execute({
        emailTemplateId: 'tpl-1',
        originalFilename: 'extra.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 100,
        buffer: Buffer.from('x'),
      }),
    ).rejects.toThrow('Đã đạt số lượng file đính kèm tối đa');
    expect(deps.storage.save).not.toHaveBeenCalled();
  });

  it('rejects a file that would push the template total over 25MB', async () => {
    const deps = buildDeps({
      existingAttachments: [{ sizeBytes: 24 * 1024 * 1024 }],
    });
    const useCase = new UploadEmailTemplateAttachmentUseCase(
      deps.templateRepo as any,
      deps.attachmentRepo as any,
      deps.storage as any,
      deps.tenantContext as any,
    );

    await expect(
      useCase.execute({
        emailTemplateId: 'tpl-1',
        originalFilename: 'extra.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 2 * 1024 * 1024,
        buffer: Buffer.from('x'),
      }),
    ).rejects.toThrow('Tổng dung lượng file đính kèm vượt quá 25MB');
    expect(deps.storage.save).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND when the template does not belong to the current organization', async () => {
    const deps = buildDeps();
    deps.templateRepo.findById.mockResolvedValue(null);
    const useCase = new UploadEmailTemplateAttachmentUseCase(
      deps.templateRepo as any,
      deps.attachmentRepo as any,
      deps.storage as any,
      deps.tenantContext as any,
    );

    await expect(
      useCase.execute({
        emailTemplateId: 'tpl-missing',
        originalFilename: 'a.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 100,
        buffer: Buffer.from('x'),
      }),
    ).rejects.toThrow('Không tìm thấy mẫu email');
  });

  it('saves the file to storage and persists metadata when all checks pass', async () => {
    const deps = buildDeps();
    const useCase = new UploadEmailTemplateAttachmentUseCase(
      deps.templateRepo as any,
      deps.attachmentRepo as any,
      deps.storage as any,
      deps.tenantContext as any,
    );

    const result = await useCase.execute({
      emailTemplateId: 'tpl-1',
      originalFilename: 'invoice.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1000,
      buffer: Buffer.from('pdf-bytes'),
    });

    expect(deps.storage.save).toHaveBeenCalledWith(
      'org-1',
      'tpl-1',
      'invoice.pdf',
      Buffer.from('pdf-bytes'),
    );
    expect(result.organizationId).toBe('org-1');
    expect(result.emailTemplateId).toBe('tpl-1');
    expect(result.filename).toBe('invoice.pdf');
    expect(result.storageKey).toBe('org-1/tpl-1/uuid.pdf');
    expect(deps.attachmentRepo.save).toHaveBeenCalledWith(result);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern upload-email-template-attachment.usecase.spec.ts`
Expected: FAIL — `Cannot find module './upload-email-template-attachment.usecase'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/modules/email-templates/application/upload-email-template-attachment.usecase.ts
import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  MAX_ATTACHMENT_COUNT,
  MAX_ATTACHMENT_SIZE_BYTES,
  MAX_TOTAL_ATTACHMENT_SIZE_BYTES,
} from './attachment-limits';
import {
  ATTACHMENT_STORAGE,
  type IAttachmentStorage,
} from './attachment-storage.port';
import {
  EMAIL_TEMPLATE_ATTACHMENT_REPOSITORY,
  type IEmailTemplateAttachmentRepository,
} from './email-template-attachment-repository.port';
import {
  EMAIL_TEMPLATE_REPOSITORY,
  type IEmailTemplateRepository,
} from './email-template-repository.port';
import { EmailTemplateAttachment } from '../domain/email-template-attachment';

export interface UploadEmailTemplateAttachmentInput {
  emailTemplateId: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  buffer: Buffer;
}

@Injectable()
export class UploadEmailTemplateAttachmentUseCase {
  constructor(
    @Inject(EMAIL_TEMPLATE_REPOSITORY)
    private readonly templateRepo: IEmailTemplateRepository,
    @Inject(EMAIL_TEMPLATE_ATTACHMENT_REPOSITORY)
    private readonly attachmentRepo: IEmailTemplateAttachmentRepository,
    @Inject(ATTACHMENT_STORAGE)
    private readonly storage: IAttachmentStorage,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(
    input: UploadEmailTemplateAttachmentInput,
  ): Promise<EmailTemplateAttachment> {
    if (
      !ALLOWED_ATTACHMENT_MIME_TYPES.includes(
        input.mimeType as (typeof ALLOWED_ATTACHMENT_MIME_TYPES)[number],
      )
    ) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'Định dạng file không hợp lệ (chỉ chấp nhận PDF, PNG, JPEG)',
      );
    }
    if (input.sizeBytes > MAX_ATTACHMENT_SIZE_BYTES) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'File quá lớn (tối đa 10MB mỗi file)',
      );
    }

    const organizationId = this.tenantContext.getOrganizationId();
    const template = await this.templateRepo.findById(input.emailTemplateId);
    if (!template) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy mẫu email.');
    }

    const existing = await this.attachmentRepo.findAllByTemplateId(
      input.emailTemplateId,
    );
    if (existing.length >= MAX_ATTACHMENT_COUNT) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        `Đã đạt số lượng file đính kèm tối đa (${MAX_ATTACHMENT_COUNT} file).`,
      );
    }
    const existingTotal = existing.reduce((sum, a) => sum + a.sizeBytes, 0);
    if (existingTotal + input.sizeBytes > MAX_TOTAL_ATTACHMENT_SIZE_BYTES) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'Tổng dung lượng file đính kèm vượt quá 25MB.',
      );
    }

    const storageKey = await this.storage.save(
      organizationId,
      input.emailTemplateId,
      input.originalFilename,
      input.buffer,
    );

    const attachment = new EmailTemplateAttachment({
      id: randomUUID(),
      organizationId,
      emailTemplateId: input.emailTemplateId,
      filename: input.originalFilename,
      storageKey,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      createdAt: new Date(),
    });
    await this.attachmentRepo.save(attachment);
    return attachment;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern upload-email-template-attachment.usecase.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/email-templates/application/upload-email-template-attachment.usecase.ts apps/backend/src/modules/email-templates/application/upload-email-template-attachment.usecase.spec.ts
git commit -m "feat: add UploadEmailTemplateAttachmentUseCase"
```

---

### Task 6: Delete (single attachment) use case

**Files:**
- Create: `apps/backend/src/modules/email-templates/application/delete-email-template-attachment.usecase.ts`
- Test: `apps/backend/src/modules/email-templates/application/delete-email-template-attachment.usecase.spec.ts`

**Interfaces:**
- Consumes: `IEmailTemplateAttachmentRepository.findById`/`.delete` (Task 3), `IAttachmentStorage.delete` (Task 4).
- Produces: `DeleteEmailTemplateAttachmentUseCase.execute(emailTemplateId: string, attachmentId: string): Promise<void>` — consumed by Task 7's controller.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/modules/email-templates/application/delete-email-template-attachment.usecase.spec.ts
import { EmailTemplateAttachment } from '../domain/email-template-attachment';
import { DeleteEmailTemplateAttachmentUseCase } from './delete-email-template-attachment.usecase';

function buildAttachment(emailTemplateId = 'tpl-1'): EmailTemplateAttachment {
  return new EmailTemplateAttachment({
    id: 'att-1',
    organizationId: 'org-1',
    emailTemplateId,
    filename: 'invoice.pdf',
    storageKey: 'org-1/tpl-1/uuid.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1000,
    createdAt: new Date('2026-08-21'),
  });
}

describe('DeleteEmailTemplateAttachmentUseCase', () => {
  it('throws ATTACHMENT_NOT_FOUND when the attachment does not exist', async () => {
    const attachmentRepo = {
      findById: jest.fn().mockResolvedValue(null),
      delete: jest.fn(),
    };
    const storage = { delete: jest.fn() };
    const useCase = new DeleteEmailTemplateAttachmentUseCase(
      attachmentRepo as any,
      storage as any,
    );

    await expect(
      useCase.execute('tpl-1', 'missing'),
    ).rejects.toThrow('Không tìm thấy file đính kèm.');
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it('throws ATTACHMENT_NOT_FOUND when the attachment belongs to a different template', async () => {
    const attachmentRepo = {
      findById: jest.fn().mockResolvedValue(buildAttachment('tpl-other')),
      delete: jest.fn(),
    };
    const storage = { delete: jest.fn() };
    const useCase = new DeleteEmailTemplateAttachmentUseCase(
      attachmentRepo as any,
      storage as any,
    );

    await expect(
      useCase.execute('tpl-1', 'att-1'),
    ).rejects.toThrow('Không tìm thấy file đính kèm.');
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it('deletes the file from storage and the DB row when found', async () => {
    const attachment = buildAttachment();
    const attachmentRepo = {
      findById: jest.fn().mockResolvedValue(attachment),
      delete: jest.fn(),
    };
    const storage = { delete: jest.fn() };
    const useCase = new DeleteEmailTemplateAttachmentUseCase(
      attachmentRepo as any,
      storage as any,
    );

    await useCase.execute('tpl-1', 'att-1');

    expect(storage.delete).toHaveBeenCalledWith('org-1/tpl-1/uuid.pdf');
    expect(attachmentRepo.delete).toHaveBeenCalledWith('att-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern delete-email-template-attachment.usecase.spec.ts`
Expected: FAIL — `Cannot find module './delete-email-template-attachment.usecase'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/modules/email-templates/application/delete-email-template-attachment.usecase.ts
import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  ATTACHMENT_STORAGE,
  type IAttachmentStorage,
} from './attachment-storage.port';
import {
  EMAIL_TEMPLATE_ATTACHMENT_REPOSITORY,
  type IEmailTemplateAttachmentRepository,
} from './email-template-attachment-repository.port';

@Injectable()
export class DeleteEmailTemplateAttachmentUseCase {
  constructor(
    @Inject(EMAIL_TEMPLATE_ATTACHMENT_REPOSITORY)
    private readonly attachmentRepo: IEmailTemplateAttachmentRepository,
    @Inject(ATTACHMENT_STORAGE)
    private readonly storage: IAttachmentStorage,
  ) {}

  async execute(
    emailTemplateId: string,
    attachmentId: string,
  ): Promise<void> {
    const attachment = await this.attachmentRepo.findById(attachmentId);
    if (!attachment || attachment.emailTemplateId !== emailTemplateId) {
      throw new AppError(
        ErrorCode.ATTACHMENT_NOT_FOUND,
        'Không tìm thấy file đính kèm.',
      );
    }

    await this.storage.delete(attachment.storageKey);
    await this.attachmentRepo.delete(attachmentId);
  }
}
```

Note: `findById` is org-scoped via `BaseRepository.scopedFindOne` (Task 3), so an attachment belonging to another organization already returns `null` here — the extra `emailTemplateId` check catches an attachment that exists in the same org but under a *different* template.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern delete-email-template-attachment.usecase.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/email-templates/application/delete-email-template-attachment.usecase.ts apps/backend/src/modules/email-templates/application/delete-email-template-attachment.usecase.spec.ts
git commit -m "feat: add DeleteEmailTemplateAttachmentUseCase"
```

---

### Task 7: ErrorCode, audit enums, response DTO, controller endpoints

**Files:**
- Modify: `apps/backend/src/common/errors/error-code.ts`
- Modify: `apps/backend/src/common/errors/status-by-error-code.ts`
- Modify: `apps/backend/src/common/audit/audit.enums.ts`
- Create: `apps/backend/src/modules/email-templates/presentation/dto/email-template-attachment-response.dto.ts`
- Modify: `apps/backend/src/modules/email-templates/presentation/email-templates.controller.ts`
- Test: `apps/backend/test/email-templates-attachments.e2e-spec.ts` (this task's RED/GREEN cycle is the e2e test, since a controller endpoint's behavior is only meaningfully observable end-to-end with `PermissionGuard`/`IdempotencyService` wired)

**Interfaces:**
- Consumes: `UploadEmailTemplateAttachmentUseCase`/`DeleteEmailTemplateAttachmentUseCase` (Task 5, 6), `EmailTemplateAttachment` (Task 1).
- Produces: `POST /api/v1/email-templates/:id/attachments`, `DELETE /api/v1/email-templates/:id/attachments/:attachmentId`.

- [ ] **Step 1: Add `ATTACHMENT_NOT_FOUND` to `ErrorCode`**

```typescript
// apps/backend/src/common/errors/error-code.ts
// Add inside the enum, after EMAIL_NOT_VERIFIED:
  EMAIL_NOT_VERIFIED = 'EMAIL_NOT_VERIFIED',
  ATTACHMENT_NOT_FOUND = 'ATTACHMENT_NOT_FOUND',
```

- [ ] **Step 2: Map its HTTP status**

```typescript
// apps/backend/src/common/errors/status-by-error-code.ts
// Add inside STATUS_BY_ERROR_CODE, after EMAIL_NOT_VERIFIED:
  [ErrorCode.EMAIL_NOT_VERIFIED]: 403,
  [ErrorCode.ATTACHMENT_NOT_FOUND]: 404,
```

- [ ] **Step 3: Add audit action types**

```typescript
// apps/backend/src/common/audit/audit.enums.ts
// Add inside AuditActionType, after EMAIL_TEMPLATE_DELETE:
  EMAIL_TEMPLATE_DELETE = 'EMAIL_TEMPLATE_DELETE',
  EMAIL_TEMPLATE_ATTACHMENT_CREATE = 'EMAIL_TEMPLATE_ATTACHMENT_CREATE',
  EMAIL_TEMPLATE_ATTACHMENT_DELETE = 'EMAIL_TEMPLATE_ATTACHMENT_DELETE',
```

- [ ] **Step 4: Write the response DTO**

```typescript
// apps/backend/src/modules/email-templates/presentation/dto/email-template-attachment-response.dto.ts
import type { EmailTemplateAttachment } from '../../domain/email-template-attachment';

export class EmailTemplateAttachmentResponseDto {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
}

export function toEmailTemplateAttachmentResponse(
  attachment: EmailTemplateAttachment,
): EmailTemplateAttachmentResponseDto {
  return {
    id: attachment.id,
    filename: attachment.filename,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    createdAt: attachment.createdAt,
  };
}
```

- [ ] **Step 5: Write the failing e2e test**

```typescript
// apps/backend/test/email-templates-attachments.e2e-spec.ts
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { bootstrapE2eApp } from './support/bootstrap-e2e-app';
import { createAuthenticatedOrg } from './support/create-authenticated-org';

describe('Email template attachments (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await bootstrapE2eApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('uploads a PDF attachment, lists it as a template field, and deletes it', async () => {
    const { agent, accessToken } = await createAuthenticatedOrg(app);

    const createRes = await agent
      .post('/api/v1/email-templates')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'With attachment',
        subject: 'Hi {{customerName}}',
        bodyHtml: '<p>{{customerName}}</p>',
      })
      .expect(201);
    const templateId = createRes.body.id as string;

    const uploadRes = await agent
      .post(`/api/v1/email-templates/${templateId}/attachments`)
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', Buffer.from('%PDF-1.4 fake'), {
        filename: 'invoice.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);

    expect(uploadRes.body.filename).toBe('invoice.pdf');
    expect(uploadRes.body.mimeType).toBe('application/pdf');
    expect(uploadRes.body.storageKey).toBeUndefined();

    await agent
      .delete(
        `/api/v1/email-templates/${templateId}/attachments/${uploadRes.body.id}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  });

  it('rejects a disallowed MIME type with VALIDATION_ERROR', async () => {
    const { agent, accessToken } = await createAuthenticatedOrg(app);
    const createRes = await agent
      .post('/api/v1/email-templates')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Bad type',
        subject: 'Hi',
        bodyHtml: '<p>hi</p>',
      })
      .expect(201);
    const templateId = createRes.body.id as string;

    const res = await agent
      .post(`/api/v1/email-templates/${templateId}/attachments`)
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', Buffer.from('not a real docx'), {
        filename: 'resume.docx',
        contentType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      })
      .expect(400);

    expect(res.body.errorCode).toBe('VALIDATION_ERROR');
  });

  it('rejects an upload from an organization that does not own the template (tenant isolation)', async () => {
    const orgA = await createAuthenticatedOrg(app);
    const orgB = await createAuthenticatedOrg(app);
    const createRes = await orgA.agent
      .post('/api/v1/email-templates')
      .set('Authorization', `Bearer ${orgA.accessToken}`)
      .send({ name: 'Org A template', subject: 'Hi', bodyHtml: '<p>hi</p>' })
      .expect(201);
    const templateId = createRes.body.id as string;

    const res = await orgB.agent
      .post(`/api/v1/email-templates/${templateId}/attachments`)
      .set('Authorization', `Bearer ${orgB.accessToken}`)
      .attach('file', Buffer.from('%PDF-1.4 fake'), {
        filename: 'invoice.pdf',
        contentType: 'application/pdf',
      })
      .expect(404);

    expect(res.body.errorCode).toBe('NOT_FOUND');
  });
});
```

If `test/support/bootstrap-e2e-app.ts` or `test/support/create-authenticated-org.ts` do not exist under those exact names, search `apps/backend/test/support/` for the equivalent existing e2e bootstrap/auth helpers (used by `email-templates`-adjacent e2e specs, e.g. reminders or SMTP config e2e tests) and import those instead — do not invent new global bootstrap helpers for this one test file.

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test:e2e -- --testPathPattern email-templates-attachments`
Expected: FAIL — 404 on `POST /api/v1/email-templates/:id/attachments` (route does not exist yet)

- [ ] **Step 7: Wire the controller endpoints**

```typescript
// apps/backend/src/modules/email-templates/presentation/email-templates.controller.ts
// Add imports at the top, alongside the existing ones:
import {
  BadRequestException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { MAX_ATTACHMENT_SIZE_BYTES } from '../application/attachment-limits';
import { DeleteEmailTemplateAttachmentUseCase } from '../application/delete-email-template-attachment.usecase';
import { UploadEmailTemplateAttachmentUseCase } from '../application/upload-email-template-attachment.usecase';
import {
  EmailTemplateAttachmentResponseDto,
  toEmailTemplateAttachmentResponse,
} from './dto/email-template-attachment-response.dto';

// Add to the constructor parameter list, after previewEmailTemplateUseCase:
    private readonly previewEmailTemplateUseCase: PreviewEmailTemplateUseCase,
    private readonly uploadAttachmentUseCase: UploadEmailTemplateAttachmentUseCase,
    private readonly deleteAttachmentUseCase: DeleteEmailTemplateAttachmentUseCase,
    private readonly idempotency: IdempotencyService,

// Add two new endpoints, after `preview()`:
  @Post(':id/attachments')
  @ApiOperation({ summary: 'Upload an attachment for an email template' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'File (multipart field "file", max 10 MB, PDF/PNG/JPEG only)',
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiCreatedResponse({ type: EmailTemplateAttachmentResponseDto })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.NOT_FOUND,
    ErrorCode.FILE_TOO_LARGE,
    ErrorCode.IDEMPOTENCY_KEY_REUSED,
  )
  @Audited(
    AuditActionType.EMAIL_TEMPLATE_ATTACHMENT_CREATE,
    AuditEntityType.EMAIL_TEMPLATE,
  )
  @RequirePermission(Permission.REMINDER_POLICY_WRITE)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_ATTACHMENT_SIZE_BYTES },
    }),
  )
  async uploadAttachment(
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) throw new BadRequestException('File là bắt buộc.');
    return this.idempotency.execute(
      `POST /email-templates/${id}/attachments`,
      key,
      { filename: file.originalname, size: file.size },
      async () => {
        const attachment = await this.uploadAttachmentUseCase.execute({
          emailTemplateId: id,
          originalFilename: file.originalname,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          buffer: file.buffer,
        });
        return toEmailTemplateAttachmentResponse(attachment);
      },
    );
  }

  @Delete(':id/attachments/:attachmentId')
  @ApiOperation({ summary: 'Delete an email template attachment' })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiOkResponse({
    description: 'Attachment deleted',
    schema: successResponseSchema(),
  })
  @ApiErrorResponse(ErrorCode.ATTACHMENT_NOT_FOUND, ErrorCode.IDEMPOTENCY_KEY_REUSED)
  @Audited(
    AuditActionType.EMAIL_TEMPLATE_ATTACHMENT_DELETE,
    AuditEntityType.EMAIL_TEMPLATE,
  )
  @RequirePermission(Permission.REMINDER_POLICY_WRITE)
  async removeAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.idempotency.execute(
      `DELETE /email-templates/${id}/attachments/${attachmentId}`,
      key,
      { id, attachmentId },
      async () => {
        await this.deleteAttachmentUseCase.execute(id, attachmentId);
        return { success: true };
      },
    );
  }
```

Note: the tenant-isolation e2e case (Step 5's third test) returns 404 `NOT_FOUND`, not `ATTACHMENT_NOT_FOUND` — `UploadEmailTemplateAttachmentUseCase` looks up the *template* first via the org-scoped `templateRepo.findById`, which returns `null` for a template owned by another org, matching the existing `NOT_FOUND` template-not-found path.

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test:e2e -- --testPathPattern email-templates-attachments`
Expected: PASS (requires Docker for testcontainers Postgres — if unavailable, run `npx tsc --noEmit` to confirm the controller compiles and defer e2e execution to Task 13's full verification pass)

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/common/errors/error-code.ts apps/backend/src/common/errors/status-by-error-code.ts apps/backend/src/common/audit/audit.enums.ts apps/backend/src/modules/email-templates/presentation/dto/email-template-attachment-response.dto.ts apps/backend/src/modules/email-templates/presentation/email-templates.controller.ts apps/backend/test/email-templates-attachments.e2e-spec.ts
git commit -m "feat: add email template attachment upload/delete endpoints"
```

---

### Task 8: Module wiring — `email-templates.module.ts`

**Files:**
- Modify: `apps/backend/src/modules/email-templates/email-templates.module.ts`

**Interfaces:**
- Consumes: every provider/token created in Tasks 3–7.
- Produces: `EMAIL_TEMPLATE_ATTACHMENT_REPOSITORY` and `ATTACHMENT_STORAGE` exported from `EmailTemplatesModule` — consumed by Task 10/11 (`NotificationsModule` already imports `EmailTemplatesModule`, per `module-wiring.md` rule of importing the whole module rather than individual providers).

No test for this task — module wiring is DI configuration, verified by the app booting (Task 7's e2e test already exercises this wiring; a second, explicit check is `npx tsc --noEmit` after this change).

- [ ] **Step 1: Update the module**

```typescript
// apps/backend/src/modules/email-templates/email-templates.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdempotencyModule } from '../../common/idempotency/idempotency.module';
import {
  ATTACHMENT_STORAGE,
} from './application/attachment-storage.port';
import { CreateEmailTemplateUseCase } from './application/create-email-template.usecase';
import { DeleteEmailTemplateAttachmentUseCase } from './application/delete-email-template-attachment.usecase';
import { DeleteEmailTemplateUseCase } from './application/delete-email-template.usecase';
import { EMAIL_TEMPLATE_ATTACHMENT_REPOSITORY } from './application/email-template-attachment-repository.port';
import { EMAIL_TEMPLATE_REPOSITORY } from './application/email-template-repository.port';
import { ListEmailTemplatesUseCase } from './application/list-email-templates.usecase';
import { PreviewEmailTemplateUseCase } from './application/preview-email-template.usecase';
import { RenderEmailTemplateUseCase } from './application/render-email-template.usecase';
import { TEMPLATE_COMPILER } from './application/template-compiler.port';
import { UpdateEmailTemplateUseCase } from './application/update-email-template.usecase';
import { UploadEmailTemplateAttachmentUseCase } from './application/upload-email-template-attachment.usecase';
import { EmailTemplateAttachmentOrmEntity } from './infrastructure/email-template-attachment.orm-entity';
import { EmailTemplateOrmEntity } from './infrastructure/email-template.orm-entity';
import { HandlebarsTemplateCompiler } from './infrastructure/handlebars-template-compiler.adapter';
import { LocalDiskAttachmentStorage } from './infrastructure/local-disk-attachment-storage.adapter';
import { TypeOrmEmailTemplateAttachmentRepository } from './infrastructure/typeorm-email-template-attachment.repository';
import { TypeOrmEmailTemplateRepository } from './infrastructure/typeorm-email-template.repository';
import { EmailTemplatesController } from './presentation/email-templates.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EmailTemplateOrmEntity,
      EmailTemplateAttachmentOrmEntity,
    ]),
    IdempotencyModule,
  ],
  providers: [
    {
      provide: EMAIL_TEMPLATE_REPOSITORY,
      useClass: TypeOrmEmailTemplateRepository,
    },
    {
      provide: EMAIL_TEMPLATE_ATTACHMENT_REPOSITORY,
      useClass: TypeOrmEmailTemplateAttachmentRepository,
    },
    {
      provide: ATTACHMENT_STORAGE,
      useClass: LocalDiskAttachmentStorage,
    },
    {
      provide: TEMPLATE_COMPILER,
      useClass: HandlebarsTemplateCompiler,
    },
    CreateEmailTemplateUseCase,
    ListEmailTemplatesUseCase,
    UpdateEmailTemplateUseCase,
    DeleteEmailTemplateUseCase,
    RenderEmailTemplateUseCase,
    PreviewEmailTemplateUseCase,
    UploadEmailTemplateAttachmentUseCase,
    DeleteEmailTemplateAttachmentUseCase,
  ],
  controllers: [EmailTemplatesController],
  exports: [
    EMAIL_TEMPLATE_REPOSITORY,
    EMAIL_TEMPLATE_ATTACHMENT_REPOSITORY,
    ATTACHMENT_STORAGE,
    RenderEmailTemplateUseCase,
  ],
})
export class EmailTemplatesModule {}
```

- [ ] **Step 2: Verify the app compiles and boots**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/modules/email-templates/email-templates.module.ts
git commit -m "chore: wire attachment repository and storage into EmailTemplatesModule"
```

---

### Task 9: Cascade-delete attachments when a template is deleted

**Files:**
- Modify: `apps/backend/src/modules/email-templates/application/delete-email-template.usecase.ts`
- Modify: `apps/backend/src/modules/email-templates/application/delete-email-template.usecase.spec.ts` (existing tests need new mock params added to every `new DeleteEmailTemplateUseCase(...)` call)

**Interfaces:**
- Consumes: `IEmailTemplateAttachmentRepository.findAllByTemplateId`/`.deleteAllByTemplateId` (Task 3), `IAttachmentStorage.delete` (Task 4).
- Produces: `DeleteEmailTemplateUseCase` constructor gains two new required params (`attachmentRepo`, `storage`), appended after the existing `dataSource` param.

- [ ] **Step 1: Write the failing test (new case + update existing calls)**

```typescript
// apps/backend/src/modules/email-templates/application/delete-email-template.usecase.spec.ts
// Add a helper and update every existing `new DeleteEmailTemplateUseCase(templateRepo as any, dataSource as any)`
// call in this file to `new DeleteEmailTemplateUseCase(templateRepo as any, dataSource as any, attachmentRepo as any, storage as any)`,
// declaring `const attachmentRepo = { findAllByTemplateId: jest.fn().mockResolvedValue([]), deleteAllByTemplateId: jest.fn() };`
// and `const storage = { delete: jest.fn() };` in each `it(...)` block (mirroring how `templateRepo`/`dataSource` are already declared per-test).

// Then add this new test at the end of the describe block:
  it('deletes attachment files from storage and their rows before deleting the template', async () => {
    const templateRepo = {
      findById: jest.fn().mockResolvedValue(buildTemplate(false)),
      delete: jest.fn(),
    };
    const dataSource = { query: jest.fn().mockResolvedValue([{ count: 0 }]) };
    const attachmentRepo = {
      findAllByTemplateId: jest.fn().mockResolvedValue([
        { storageKey: 'org-1/tpl-1/a.pdf' },
        { storageKey: 'org-1/tpl-1/b.png' },
      ]),
      deleteAllByTemplateId: jest.fn(),
    };
    const storage = { delete: jest.fn() };
    const useCase = new DeleteEmailTemplateUseCase(
      templateRepo as any,
      dataSource as any,
      attachmentRepo as any,
      storage as any,
    );

    await useCase.execute('tpl-1');

    expect(storage.delete).toHaveBeenCalledWith('org-1/tpl-1/a.pdf');
    expect(storage.delete).toHaveBeenCalledWith('org-1/tpl-1/b.png');
    expect(attachmentRepo.deleteAllByTemplateId).toHaveBeenCalledWith('tpl-1');
    expect(templateRepo.delete).toHaveBeenCalledWith('tpl-1');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern delete-email-template.usecase.spec.ts`
Expected: FAIL — `DeleteEmailTemplateUseCase` constructor doesn't accept 4 args (TS error) or the new test's spies are never called

- [ ] **Step 3: Update the use case**

```typescript
// apps/backend/src/modules/email-templates/application/delete-email-template.usecase.ts
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  ATTACHMENT_STORAGE,
  type IAttachmentStorage,
} from './attachment-storage.port';
import {
  EMAIL_TEMPLATE_ATTACHMENT_REPOSITORY,
  type IEmailTemplateAttachmentRepository,
} from './email-template-attachment-repository.port';
import {
  EMAIL_TEMPLATE_REPOSITORY,
  type IEmailTemplateRepository,
} from './email-template-repository.port';

@Injectable()
export class DeleteEmailTemplateUseCase {
  constructor(
    @Inject(EMAIL_TEMPLATE_REPOSITORY)
    private readonly templateRepo: IEmailTemplateRepository,
    private readonly dataSource: DataSource,
    @Inject(EMAIL_TEMPLATE_ATTACHMENT_REPOSITORY)
    private readonly attachmentRepo: IEmailTemplateAttachmentRepository,
    @Inject(ATTACHMENT_STORAGE)
    private readonly storage: IAttachmentStorage,
  ) {}

  async execute(id: string): Promise<void> {
    const template = await this.templateRepo.findById(id);
    if (!template) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy mẫu email.');
    }
    if (template.isDefault) {
      throw new AppError(
        ErrorCode.CONFLICT,
        'Không thể xóa mẫu email mặc định.',
      );
    }

    const referenced = await this.isReferencedByReminderRule(
      id,
      template.organizationId,
    );
    if (referenced) {
      throw new AppError(
        ErrorCode.TEMPLATE_IN_USE,
        'Không thể xóa mẫu email đang được một quy tắc nhắc nhở sử dụng.',
      );
    }

    const attachments = await this.attachmentRepo.findAllByTemplateId(id);
    for (const attachment of attachments) {
      await this.storage.delete(attachment.storageKey);
    }
    await this.attachmentRepo.deleteAllByTemplateId(id);

    await this.templateRepo.delete(id);
  }

  private async isReferencedByReminderRule(
    templateId: string,
    organizationId: string,
  ): Promise<boolean> {
    const rows: Array<{ count: number }> = await this.dataSource.query(
      'SELECT COUNT(*)::int AS count FROM reminder_rules r JOIN reminder_policies p ON p.id::text = r."reminderPolicyId" WHERE r."emailTemplateId" = $1 AND p."organizationId" = $2',
      [templateId, organizationId],
    );
    return Number(rows[0]?.count ?? 0) > 0;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern delete-email-template.usecase.spec.ts`
Expected: PASS (all existing tests + the new cascade-delete test)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/email-templates/application/delete-email-template.usecase.ts apps/backend/src/modules/email-templates/application/delete-email-template.usecase.spec.ts
git commit -m "feat: cascade-delete attachment files when an email template is deleted"
```

---

### Task 10: Extend `ReminderEmailJob` and `EmailService` with attachment references

**Files:**
- Modify: `apps/backend/src/modules/notifications/application/email-queue.port.ts`
- Modify: `apps/backend/src/modules/notifications/application/email.service.ts`
- Modify: (spec for `EmailService` if one exists — check `apps/backend/src/modules/notifications/application/*.spec.ts`; if none exists, this task's RED/GREEN cycle is the Task 11 e2e-level test instead, and this task's own verification is `npx tsc --noEmit` plus visual diff review)

**Interfaces:**
- Consumes: `EMAIL_TEMPLATE_ATTACHMENT_REPOSITORY`/`IEmailTemplateAttachmentRepository` (Task 3, exported from `EmailTemplatesModule` in Task 8, already imported by `NotificationsModule`).
- Produces: `ReminderEmailJob.attachmentRefs?: EmailAttachmentRef[]` where `EmailAttachmentRef = { storageKey: string; filename: string; mimeType: string }` — consumed by Task 11's `EmailQueueProcessor`.

- [ ] **Step 1: Check for an existing `EmailService` spec**

Run: `ls apps/backend/src/modules/notifications/application/*.spec.ts`

If `email.service.spec.ts` exists, read it and add a test asserting `emailQueue.add` is called with an `attachmentRefs` array built from `attachmentRepo.findAllByTemplateId(template.id)`. If it does not exist, skip to Step 2 (this file currently has no dedicated unit test — `EmailService` is exercised only through e2e specs — and this plan does not introduce one, consistent with "one vertical slice at a time" not requiring a full retrofit of an untested file's other methods).

- [ ] **Step 2: Add `EmailAttachmentRef` and extend `ReminderEmailJob`**

```typescript
// apps/backend/src/modules/notifications/application/email-queue.port.ts
// Add near the top, after the EmailAttachment import:
export interface EmailAttachmentRef {
  storageKey: string;
  filename: string;
  mimeType: string;
}

// Change the ReminderEmailJob interface to add one field:
export interface ReminderEmailJob {
  reminderExecutionId: string;
  receivableId: string;
  organizationId: string;
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
  forceProvider?: 'RESEND';
  fromName?: string;
  attachmentRefs?: EmailAttachmentRef[];
}
```

- [ ] **Step 3: Populate `attachmentRefs` in `EmailService.sendReminderEmail`**

```typescript
// apps/backend/src/modules/notifications/application/email.service.ts
// Add imports:
import {
  EMAIL_TEMPLATE_ATTACHMENT_REPOSITORY,
  type IEmailTemplateAttachmentRepository,
} from '../../email-templates/application/email-template-attachment-repository.port';

// Add to the constructor parameter list, after templateRepo:
    @Inject(EMAIL_TEMPLATE_REPOSITORY)
    private readonly templateRepo: IEmailTemplateRepository,
    @Inject(EMAIL_TEMPLATE_ATTACHMENT_REPOSITORY)
    private readonly attachmentRepo: IEmailTemplateAttachmentRepository,

// Inside sendReminderEmail, after `const rendered = this.renderUseCase.render(...)`
// and before the try/emailQueue.add block, fetch attachments:
    const attachments = await this.attachmentRepo.findAllByTemplateId(
      template.id,
    );

// Inside the emailQueue.add(...) data object, add one field after `fromName`:
          fromName: organization?.name
            ? `${organization.name} (qua Casso)`
            : undefined,
          ...(attachments.length
            ? {
                attachmentRefs: attachments.map((a) => ({
                  storageKey: a.storageKey,
                  filename: a.filename,
                  mimeType: a.mimeType,
                })),
              }
            : {}),
```

- [ ] **Step 4: Verify compilation**

Run: `npx tsc --noEmit`
Expected: no errors (this also confirms `NotificationsModule` sees `EMAIL_TEMPLATE_ATTACHMENT_REPOSITORY` through its existing `EmailTemplatesModule` import from Task 8)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/notifications/application/email-queue.port.ts apps/backend/src/modules/notifications/application/email.service.ts
git commit -m "feat: enqueue email template attachment references with reminder emails"
```

---

### Task 11: `EmailQueueProcessor` reads, re-validates, and sends attachments

**Files:**
- Modify: `apps/backend/src/modules/notifications/infrastructure/email-queue.processor.ts`
- Test: check for `apps/backend/src/modules/notifications/infrastructure/email-queue.processor.spec.ts`; if it exists, extend it — otherwise this task's RED/GREEN cycle is a new spec file (see Step 1).

**Interfaces:**
- Consumes: `ReminderEmailJob.attachmentRefs` (Task 10), `IAttachmentStorage.exists`/`.read` (Task 4), `EmailAttachment` (existing, `common/email/email-attachment.ts`).
- Produces: `EmailQueueProcessor` calls `adapter.send(..., options)` with `options.attachments` built from `attachmentRefs`, inline-tagging via `contentId` when `html.includes(\`cid:${filename}\`)`.

- [ ] **Step 1: Check for an existing processor spec, write/extend the failing test**

Run: `ls apps/backend/src/modules/notifications/infrastructure/email-queue.processor.spec.ts`

If it exists, read it fully first to match its existing mock shapes (resolver, executionRepo, etc.), then add:

```typescript
// apps/backend/src/modules/notifications/infrastructure/email-queue.processor.spec.ts
// (add this test inside the existing describe block for processReminderEmail /
// processEmail, using whatever mock-building helper the file already has —
// e.g. if the file has a `buildProcessor()` helper, extend its deps object
// with `storage: { exists: jest.fn().mockResolvedValue(true), read: jest.fn() }`)

  it('reads attachment refs from storage, marks cid-referenced ones inline, and passes them to adapter.send', async () => {
    const send = jest.fn().mockResolvedValue({ providerMessageId: 'msg-1' });
    const resolver = { resolve: jest.fn().mockResolvedValue({ send }) };
    const executionRepo = {
      getStatus: jest.fn().mockResolvedValue('PENDING'),
      updateSendResult: jest.fn(),
    };
    const storage = {
      exists: jest.fn().mockResolvedValue(true),
      read: jest.fn().mockResolvedValue(Buffer.from('file-bytes')),
    };
    const processor = buildProcessor({ resolver, executionRepo, storage });

    const job = {
      id: 'job-1',
      name: 'send-reminder-email',
      data: {
        reminderExecutionId: 'exec-1',
        organizationId: 'org-1',
        to: 'a@b.com',
        subject: 'Hi',
        html: '<p><img src="cid:logo.png"></p>',
        attachmentRefs: [
          {
            storageKey: 'org-1/tpl-1/uuid1.png',
            filename: 'logo.png',
            mimeType: 'image/png',
          },
          {
            storageKey: 'org-1/tpl-1/uuid2.pdf',
            filename: 'invoice.pdf',
            mimeType: 'application/pdf',
          },
        ],
      },
      opts: { attempts: 3 },
      attemptsMade: 0,
    } as any;

    await processor.process(job);

    expect(send).toHaveBeenCalledWith(
      'a@b.com',
      'Hi',
      '<p><img src="cid:logo.png"></p>',
      { reminderExecutionId: 'exec-1' },
      undefined,
      undefined,
      {
        attachments: [
          {
            filename: 'logo.png',
            content: Buffer.from('file-bytes').toString('base64'),
            contentId: 'logo.png',
            contentType: 'image/png',
          },
          {
            filename: 'invoice.pdf',
            content: Buffer.from('file-bytes').toString('base64'),
            contentType: 'application/pdf',
          },
        ],
      },
    );
  });

  it('skips a referenced attachment that no longer exists on disk instead of failing the send', async () => {
    const send = jest.fn().mockResolvedValue({ providerMessageId: 'msg-1' });
    const resolver = { resolve: jest.fn().mockResolvedValue({ send }) };
    const executionRepo = {
      getStatus: jest.fn().mockResolvedValue('PENDING'),
      updateSendResult: jest.fn(),
    };
    const storage = {
      exists: jest.fn().mockResolvedValue(false),
      read: jest.fn(),
    };
    const processor = buildProcessor({ resolver, executionRepo, storage });

    const job = {
      id: 'job-1',
      name: 'send-reminder-email',
      data: {
        reminderExecutionId: 'exec-1',
        organizationId: 'org-1',
        to: 'a@b.com',
        subject: 'Hi',
        html: '<p>hi</p>',
        attachmentRefs: [
          {
            storageKey: 'org-1/tpl-1/uuid1.png',
            filename: 'deleted.png',
            mimeType: 'image/png',
          },
        ],
      },
      opts: { attempts: 3 },
      attemptsMade: 0,
    } as any;

    await processor.process(job);

    expect(storage.read).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(
      'a@b.com',
      'Hi',
      '<p>hi</p>',
      { reminderExecutionId: 'exec-1' },
      undefined,
      undefined,
      undefined,
    );
  });
```

If no spec file exists yet, create one from scratch, constructing `EmailQueueProcessor` directly with `jest.fn()` mocks for all nine existing constructor dependencies (see the file's current constructor in the codebase) plus the new `storage` dependency — do not use `@nestjs/testing`'s `Test.createTestingModule` for this (mirrors the plain-constructor-mock style already used by every other spec in this plan).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern email-queue.processor.spec.ts`
Expected: FAIL — `attachmentRefs` handling doesn't exist yet, `send` called without the `options` arg

- [ ] **Step 3: Update the processor**

```typescript
// apps/backend/src/modules/notifications/infrastructure/email-queue.processor.ts
// Add imports:
import type { EmailAttachment } from '../../../common/email/email-attachment';
import {
  ATTACHMENT_STORAGE,
  type IAttachmentStorage,
} from '../../email-templates/application/attachment-storage.port';
import type { EmailAttachmentRef } from '../application/email-queue.port';

// Add to the constructor parameter list, after emailQueue:
    @Inject(EMAIL_QUEUE_PORT) private readonly emailQueue: IEmailQueue,
    @Inject(ATTACHMENT_STORAGE) private readonly attachmentStorage: IAttachmentStorage,

// Add a new private method, near processReminderEmail:
  private async buildEmailAttachments(
    refs: EmailAttachmentRef[] | undefined,
    html: string,
  ): Promise<EmailAttachment[] | undefined> {
    if (!refs || refs.length === 0) return undefined;

    const attachments: EmailAttachment[] = [];
    for (const ref of refs) {
      const stillExists = await this.attachmentStorage.exists(ref.storageKey);
      if (!stillExists) {
        this.logger.warn({
          message: 'Skipping reminder attachment that no longer exists on disk',
          storageKey: ref.storageKey,
          filename: ref.filename,
        });
        continue;
      }
      const buffer = await this.attachmentStorage.read(ref.storageKey);
      const isInline = html.includes(`cid:${ref.filename}`);
      attachments.push({
        filename: ref.filename,
        content: buffer.toString('base64'),
        contentType: ref.mimeType,
        ...(isInline ? { contentId: ref.filename } : {}),
      });
    }
    return attachments.length > 0 ? attachments : undefined;
  }

// Change processReminderEmail's destructuring and adapter.send call:
  private async processReminderEmail(
    job: Job<ReminderEmailJob>,
  ): Promise<void> {
    const {
      reminderExecutionId,
      organizationId,
      to,
      replyTo,
      subject,
      html,
      forceProvider,
      fromName,
      attachmentRefs,
    } = job.data;

    await this.tenantContext.run(
      { userId: 'system', organizationId, role: Role.OWNER },
      async () => {
        const status = await this.executionRepo.getStatus(reminderExecutionId);
        if (status !== ReminderExecutionStatus.PENDING) {
          this.logger.warn({
            message:
              'Skipping email send because the execution is no longer pending',
            reminderExecutionId,
            status: status ?? 'unknown',
            organizationId,
            userId: 'system',
            requestId: getJobRequestId(job),
          });
          return;
        }

        const attachments = await this.buildEmailAttachments(
          attachmentRefs,
          html,
        );

        const adapter = await this.resolver.resolve(
          organizationId,
          forceProvider,
        );
        const result = await adapter.send(
          to,
          subject,
          html,
          { reminderExecutionId },
          replyTo,
          fromName,
          attachments ? { attachments } : undefined,
        );
        await this.executionRepo.updateSendResult(
          reminderExecutionId,
          'SENT',
          result.providerMessageId,
        );
        this.eventEmitter.emit('reminder.execution.completed', {
          id: reminderExecutionId,
          status: 'SENT',
          providerMessageId: result.providerMessageId,
          organizationId,
        });
      },
    );
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern email-queue.processor.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/notifications/infrastructure/email-queue.processor.ts apps/backend/src/modules/notifications/infrastructure/email-queue.processor.spec.ts
git commit -m "feat: send email template attachments from the reminder email worker"
```

---

### Task 12: Frontend — upload UI in the template dialog

**Files:**
- Modify: `apps/frontend/src/features/settings/types.ts` (check current contents first; add `EmailTemplateAttachment` type)
- Modify: `apps/frontend/src/features/settings/api/settings-api.ts`
- Modify: `apps/frontend/src/features/settings/api/use-settings.ts`
- Modify: `apps/frontend/src/features/settings/components/template-dialog.tsx`

**Interfaces:**
- Consumes: `POST /api/v1/email-templates/:id/attachments`, `GET /api/v1/email-templates` (existing, would need to also return attachments — see Step 1), `DELETE /api/v1/email-templates/:id/attachments/:attachmentId` (Task 7).
- Produces: attachment list + upload/delete UI inside `TemplateDialog`.

This task has no Jest unit test (React component behavior here is thin — file input + mutation calls already covered by the mutation hooks' own logic, which reuse the existing `useMutation` pattern with no new branching logic worth isolating). Verification is manual: `pnpm dev:backend`, `pnpm --filter @casso-ledger/frontend dev`, and clicking through the flow in a browser (per `CLAUDE.md`'s "For UI or frontend changes... test the golden path... before reporting the task as complete").

- [ ] **Step 1: Extend the backend response DTO so templates carry their attachments**

The FE needs attachments alongside each template (for the dialog to render the current list on open). Extend `EmailTemplateResponseDto`:

```typescript
// apps/backend/src/modules/email-templates/presentation/dto/email-template-response.dto.ts
import type { EmailTemplateAttachment } from '../../domain/email-template-attachment';
import type { EmailTemplate } from '../../domain/email-template';
import {
  EmailTemplateAttachmentResponseDto,
  toEmailTemplateAttachmentResponse,
} from './email-template-attachment-response.dto';

export class EmailTemplateResponseDto {
  id: string;
  name: string;
  subject: string;
  bodyHtml: string;
  reminderStage: string | null;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
  attachments: EmailTemplateAttachmentResponseDto[];
}

export function toEmailTemplateResponse(
  template: EmailTemplate,
  attachments: EmailTemplateAttachment[] = [],
): EmailTemplateResponseDto {
  return {
    id: template.id,
    name: template.name,
    subject: template.subject,
    bodyHtml: template.bodyHtml,
    reminderStage: template.reminderStage,
    isDefault: template.isDefault,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
    attachments: attachments.map(toEmailTemplateAttachmentResponse),
  };
}
```

Then update every call site in `email-templates.controller.ts` (`list`, `create`, `update`, and the new `uploadAttachment`) to pass the second argument. For `list`, fetch attachments per template with `Promise.all`:

```typescript
// apps/backend/src/modules/email-templates/presentation/email-templates.controller.ts
// list():
  async list(@Query('page') page?: string, @Query('limit') limit?: string) {
    const templates = await this.listEmailTemplatesUseCase.execute({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    return Promise.all(
      templates.map(async (template) =>
        toEmailTemplateResponse(
          template,
          await this.attachmentRepo.findAllByTemplateId(template.id),
        ),
      ),
    );
  }
```

This requires injecting `IEmailTemplateAttachmentRepository` directly into the controller. Per `application.md`, controllers may only call use cases, not repository ports directly — so instead extend the existing list use case.

Read `list-email-templates.usecase.ts` in full before editing. Change it to:

```typescript
// apps/backend/src/modules/email-templates/application/list-email-templates.usecase.ts
// Add imports:
import {
  EMAIL_TEMPLATE_ATTACHMENT_REPOSITORY,
  type IEmailTemplateAttachmentRepository,
} from './email-template-attachment-repository.port';
import type { EmailTemplateAttachment } from '../domain/email-template-attachment';

export interface EmailTemplateWithAttachments {
  template: EmailTemplate;
  attachments: EmailTemplateAttachment[];
}

// Add EMAIL_TEMPLATE_ATTACHMENT_REPOSITORY to the constructor param list
// (alongside the existing EMAIL_TEMPLATE_REPOSITORY inject), and change
// execute()'s return type from Promise<EmailTemplate[]> to
// Promise<EmailTemplateWithAttachments[]>, mapping each template through
// `attachmentRepo.findAllByTemplateId(template.id)` with Promise.all.
```

Update `list-email-templates.usecase.spec.ts` to match the new return shape (add an `attachmentRepo` mock returning `[]`, assert `result[0].template`/`result[0].attachments`).

`create`/`update`/`uploadAttachment` are unaffected by this change — they keep calling `toEmailTemplateResponse(template)` with no second argument (a newly created or just-edited template's attachment list is unchanged by those use cases, and the DTO's `attachments` parameter already defaults to `[]`). Only `list()` changes, to consume the new shape:

```typescript
// apps/backend/src/modules/email-templates/presentation/email-templates.controller.ts
  async list(@Query('page') page?: string, @Query('limit') limit?: string) {
    const results = await this.listEmailTemplatesUseCase.execute({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    return results.map((result) =>
      toEmailTemplateResponse(result.template, result.attachments),
    );
  }
```

- [ ] **Step 2: Run backend tests to confirm nothing broke**

Run: `npx jest --testPathPattern "email-templates"`
Expected: PASS (including the updated `list-email-templates.usecase.spec.ts`)

- [ ] **Step 3: Add the FE type**

```typescript
// apps/frontend/src/lib/use-email-templates.ts
// Add a new interface and extend EmailTemplate:
export interface EmailTemplateAttachment {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  bodyHtml: string;
  reminderStage: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  attachments: EmailTemplateAttachment[];
}
```

- [ ] **Step 4: Add the API functions**

```typescript
// apps/frontend/src/features/settings/api/settings-api.ts
// Add near the other email-template functions (read the file's existing
// imports/apiRequest usage first to match style):
import type { EmailTemplateAttachment } from '@/lib/use-email-templates';

export function uploadEmailTemplateAttachment(
  templateId: string,
  file: File,
): Promise<EmailTemplateAttachment> {
  const formData = new FormData();
  formData.append('file', file);
  return apiRequest<EmailTemplateAttachment>({
    url: `/api/v1/email-templates/${templateId}/attachments`,
    method: 'POST',
    data: formData,
    headers: {
      'Idempotency-Key': crypto.randomUUID(),
      'Content-Type': 'multipart/form-data',
    },
  });
}

export function deleteEmailTemplateAttachment(
  templateId: string,
  attachmentId: string,
): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>({
    url: `/api/v1/email-templates/${templateId}/attachments/${attachmentId}`,
    method: 'DELETE',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  });
}
```

- [ ] **Step 5: Add the mutation hooks**

```typescript
// apps/frontend/src/features/settings/api/use-settings.ts
// Add imports:
import {
  deleteEmailTemplateAttachment,
  uploadEmailTemplateAttachment,
} from './settings-api';

// Add new hooks, after useDeleteTemplate:
export function useUploadTemplateAttachment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ templateId, file }: { templateId: string; file: File }) =>
      uploadEmailTemplateAttachment(templateId, file),
    onSuccess: () => {
      toast.success('Đã tải lên file đính kèm.');
      void queryClient.invalidateQueries({ queryKey: emailTemplatesKey });
    },
    onError: () => toast.error('Không thể tải lên file đính kèm.'),
  });
}

export function useDeleteTemplateAttachment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      templateId,
      attachmentId,
    }: {
      templateId: string;
      attachmentId: string;
    }) => deleteEmailTemplateAttachment(templateId, attachmentId),
    onSuccess: () => {
      toast.success('Đã xoá file đính kèm.');
      void queryClient.invalidateQueries({ queryKey: emailTemplatesKey });
    },
    onError: () => toast.error('Không thể xoá file đính kèm.'),
  });
}
```

- [ ] **Step 6: Add the upload UI to `TemplateDialog`**

```typescript
// apps/frontend/src/features/settings/components/template-dialog.tsx
// Add imports:
import { useRef } from 'react';
import {
  useCreateTemplate,
  useDeleteTemplateAttachment,
  useUpdateTemplate,
  useUploadTemplateAttachment,
} from '../api/use-settings';

// Inside the component, after the existing hooks:
  const uploadAttachment = useUploadTemplateAttachment();
  const deleteAttachment = useDeleteTemplateAttachment();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !template) return;
    uploadAttachment.mutate(
      { templateId: template.id, file },
      { onSettled: () => { if (fileInputRef.current) fileInputRef.current.value = ''; } },
    );
  }

// Inside the JSX, after the bodyHtml Label block and before DialogFooter,
// only render attachments when editing an existing template (uploads need
// a saved template.id — matches Q1's "attachments belong to a saved template"
// design, so a brand-new unsaved template shows no attachment section yet):
        {template && (
          <div className="space-y-2">
            <span className="text-sm font-medium">File đính kèm</span>
            <ul className="space-y-1">
              {template.attachments.map((attachment) => (
                <li
                  key={attachment.id}
                  className="flex items-center justify-between text-sm"
                >
                  <span>{attachment.filename}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={deleteAttachment.isPending}
                    onClick={() =>
                      deleteAttachment.mutate({
                        templateId: template.id,
                        attachmentId: attachment.id,
                      })
                    }
                  >
                    Xoá
                  </Button>
                </li>
              ))}
            </ul>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/png,image/jpeg"
              disabled={uploadAttachment.isPending}
              onChange={handleFileChange}
            />
          </div>
        )}
```

- [ ] **Step 7: Manual verification**

Run: `pnpm dev:backend` (one terminal) and `pnpm --filter @casso-ledger/frontend dev` (another terminal), then in a browser: open Settings → Email Templates, edit an existing template, upload a PDF, confirm it appears in the list, delete it, confirm it disappears.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/modules/email-templates apps/frontend/src/lib/use-email-templates.ts apps/frontend/src/features/settings
git commit -m "feat: add email template attachment upload UI"
```

---

### Task 13: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full backend unit suite**

Run: `pnpm --filter @casso-ledger/backend test`
Expected: all tests pass, including every new/modified spec from Tasks 1–11

- [ ] **Step 2: Run backend e2e tests (requires Docker)**

Run: `pnpm --filter @casso-ledger/backend test:e2e`
Expected: all tests pass, including Task 7's `email-templates-attachments.e2e-spec.ts`. If Docker is unavailable in this environment, state that explicitly instead of claiming this step passed.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Run `domain-check`**

Run the `/domain-check` skill per `AGENTS.md`'s "After any backend code change" rule. Fix any violations it reports (e.g. an accidental infra import in `application/`) before proceeding.

- [ ] **Step 5: Lint and format**

Run: `npx biome check --write .`
Expected: no remaining issues after auto-fix; review the diff for anything auto-fix changed unexpectedly

- [ ] **Step 6: Run `pnpm verify`**

Run: `pnpm verify`
Expected: lint + type-check + test all pass

- [ ] **Step 7: Update the feature map**

Read `docs/wayfinder/feature-map.md`, find the row/entry for issue #275, change its status to `done`, add `Shipped:` with today's date and a placeholder PR reference to be filled in once the PR is opened (per `AGENTS.md`'s required workflow step).

- [ ] **Step 8: Commit**

```bash
git add docs/wayfinder/feature-map.md
git commit -m "docs: mark issue #275 (email template attachments) shipped"
```

---

### Task 14: Open the PR

- [ ] **Step 1: Push the branch**

```bash
git push -u origin lengocanh2005it/feat-275-email-attachments
```

- [ ] **Step 2: Open the PR**

```bash
gh pr create --title "feat: support file and image attachments in custom business emails" --body "Closes #275

## Summary
- Attachments (PDF/PNG/JPEG, max 5 files / 10MB each / 25MB total) attach to a saved EmailTemplate and auto-send with every reminder using it.
- Inline images referenced via <img src=\"cid:filename.png\"> in the template body.
- Files stored on local disk, org+template-scoped path, random on-disk filenames.
- ReminderEmailJob carries attachment references only (no base64 in the queue payload); the worker re-validates file existence before sending.
- Both Resend and organization SMTP adapters already supported EmailAttachment[] — reminder path now wires into it.

## Test plan
- [ ] pnpm --filter @casso-ledger/backend test
- [ ] pnpm --filter @casso-ledger/backend test:e2e
- [ ] npx tsc --noEmit
- [ ] Manual: upload/delete attachment in Settings > Email Templates, send a reminder using that template, confirm the attachment arrives"
```

- [ ] **Step 3: Wait for user review before merging** (per `AGENTS.md` workflow step 4 — do not merge without explicit approval)
