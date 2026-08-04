# Email Template Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the `EmailTemplate` entity and its full lifecycle — seed 4 default templates when a new `Organization` signs up, CRUD API gated by RBAC, Handlebars-based rendering with a fixed closed set of variables (auto-escaped against XSS), and a preview endpoint that renders with sample data without sending anything.

**Architecture:** New `apps/backend/src/modules/email-templates/` module following the same 4-layer Clean Architecture pattern (`domain/application/infrastructure/presentation`) as every other module in this codebase. `TypeOrmEmailTemplateRepository` extends `BaseRepository` for request-scoped reads/writes. Signup seeding is not an unscoped escape hatch: it receives the signup transaction's `EntityManager`, explicitly writes the new `organizationId`, and commits or rolls back with the organization bootstrap.

**Tech Stack:** NestJS 10, TypeORM 0.3, `handlebars` (new dependency, this plan), Jest + testcontainers + supertest, builds on `BaseRepository`/`TenantContextService`/`PermissionGuard` from `2026-08-03-multi-tenancy-rbac.md` and the `IOrganizationBootstrap` seam from `2026-08-03-authentication-onboarding.md`.

## Global Constraints

- `EmailTemplate.bodyHtml` (and `subject`) are Handlebars templates — always rendered via `Handlebars.compile(...)`, never raw string interpolation, so variable output is HTML-escaped by default (spec section 3).
- Fixed closed set of 7 render variables: `customerName`, `invoiceNumber`, `originalAmount`, `remainingAmount`, `dueDate`, `daysOverdue`, `organizationName` — no arbitrary caller-supplied variables (spec section 3).
- No template version history / audit table in this plan — editing is a direct `UPDATE`, no history rows (spec section 1).
- `isDefault=true` templates can have their content edited but can never be deleted (spec sections 1, 2, and 4).
- `DELETE /api/v1/email-templates/:id` is blocked with `409` if `isDefault=true` OR any reminder rule still references the `templateId` (spec section 4).
- Exactly 4 default templates (`isDefault=true`) are seeded per new `Organization`, inside the `IOrganizationBootstrap` transaction owned by Auth (spec section 2).
- Write endpoints (`POST`, `PATCH`, `DELETE`, `POST /:id/preview`) are gated by `Permission.REMINDER_POLICY_WRITE`, reusing the existing permission (RBAC plan's `ROLE_PERMISSIONS` table already assigns it to `OWNER`/`FINANCE_MANAGER`).
- Naming/layering rules from `2026-08-03-project-scaffolding-architecture-design.md` still apply: `domain/` has no NestJS/TypeORM imports; dependency direction is presentation → application → domain, infrastructure → application.

---

## File Structure

```
apps/backend/src/
  modules/
    email-templates/
      domain/
        email-template.ts
      application/
        email-template-repository.port.ts
        render-email-template.usecase.ts
        create-email-template.usecase.ts
        list-email-templates.usecase.ts
        update-email-template.usecase.ts
        delete-email-template.usecase.ts
        preview-email-template.usecase.ts
        seed-default-email-templates.ts
      infrastructure/
        email-template.orm-entity.ts
        typeorm-email-template.repository.ts
      presentation/
        email-templates.controller.ts
        dto/
          create-email-template.dto.ts
          update-email-template.dto.ts
      email-templates.module.ts
    auth/
      infrastructure/default-organization-bootstrap.adapter.ts -- MODIFY: consume the seed factory
      infrastructure/default-organization-bootstrap.adapter.spec.ts -- CREATE: adapter test
      auth.module.ts                                 -- MODIFY: import EmailTemplatesModule
  app.module.ts                                      -- MODIFY: register EmailTemplatesModule
test/
  email-templates.integration.spec.ts
```

---

### Task 1: `EmailTemplate` domain entity

**Files:**
- Create: `apps/backend/src/modules/email-templates/domain/email-template.ts`
- Test: `apps/backend/src/modules/email-templates/domain/email-template.spec.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `EmailTemplate` domain class with `updateContent(subject, bodyHtml)`, used by every later task in this plan

- [ ] **Step 1: Write failing domain test**

Create `apps/backend/src/modules/email-templates/domain/email-template.spec.ts`:

```typescript
import { EmailTemplate } from './email-template';

function buildTemplate(overrides: Partial<ConstructorParameters<typeof EmailTemplate>[0]> = {}): EmailTemplate {
  return new EmailTemplate({
    id: 'tpl-1',
    organizationId: 'org-1',
    name: '1 Day Overdue Reminder',
    subject: 'Invoice {{invoiceNumber}} is overdue',
    bodyHtml: '<p>Dear {{customerName}}</p>',
    reminderStage: '1 Day Overdue Reminder',
    isDefault: true,
    createdAt: new Date('2026-08-01'),
    updatedAt: new Date('2026-08-01'),
    ...overrides,
  });
}

describe('EmailTemplate domain entity', () => {
  it('creates a template with the provided fields', () => {
    const template = buildTemplate();

    expect(template.name).toBe('1 Day Overdue Reminder');
    expect(template.isDefault).toBe(true);
    expect(template.reminderStage).toBe('1 Day Overdue Reminder');
  });

  it('updateContent returns a new instance with subject/bodyHtml replaced and updatedAt refreshed', () => {
    const template = buildTemplate({ updatedAt: new Date('2026-08-01T00:00:00.000Z') });

    const updated = template.updateContent('Hello {{customerName}}', '<p>New content</p>');

    expect(updated.subject).toBe('Hello {{customerName}}');
    expect(updated.bodyHtml).toBe('<p>New content</p>');
    expect(updated.updatedAt.getTime()).toBeGreaterThan(template.updatedAt.getTime());
    // original instance is unchanged (immutable domain object)
    expect(template.subject).toBe('Invoice {{invoiceNumber}} is overdue');
  });

  it('allows updateContent even when isDefault is true (content editable, row not deletable)', () => {
    const template = buildTemplate({ isDefault: true });

    const updated = template.updateContent('New hello', '<p>New</p>');

    expect(updated.isDefault).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test email-template.spec.ts`
Expected: FAIL — Cannot find module './email-template'

- [ ] **Step 3: Create `apps/backend/src/modules/email-templates/domain/email-template.ts`**

```typescript
export interface EmailTemplateProps {
  id: string;
  organizationId: string;
  name: string;
  subject: string;
  bodyHtml: string;
  reminderStage: string | null;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class EmailTemplate {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly subject: string;
  readonly bodyHtml: string;
  readonly reminderStage: string | null;
  readonly isDefault: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: EmailTemplateProps) {
    this.id = props.id;
    this.organizationId = props.organizationId;
    this.name = props.name;
    this.subject = props.subject;
    this.bodyHtml = props.bodyHtml;
    this.reminderStage = props.reminderStage;
    this.isDefault = props.isDefault;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  updateContent(subject: string, bodyHtml: string): EmailTemplate {
    return new EmailTemplate({
      ...this,
      subject,
      bodyHtml,
      updatedAt: new Date(),
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test email-template.spec.ts`
Expected: all 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/email-templates/domain
git commit -m "feat: add EmailTemplate domain entity"
```

---

### Task 2: `EmailTemplate` infrastructure + repository + module skeleton

**Files:**
- Create: `apps/backend/src/modules/email-templates/infrastructure/email-template.orm-entity.ts`
- Create: `apps/backend/src/modules/email-templates/application/email-template-repository.port.ts`
- Create: `apps/backend/src/modules/email-templates/infrastructure/typeorm-email-template.repository.ts`
- Create: `apps/backend/src/modules/email-templates/email-templates.module.ts`
- Modify: `apps/backend/src/app.module.ts`

**Interfaces:**
- Consumes: `EmailTemplate` domain class (Task 1), `BaseRepository`/`TenantContextService` (`2026-08-03-multi-tenancy-rbac.md` Task 5, Task 3)
- Produces: `IEmailTemplateRepository`, DI token `EMAIL_TEMPLATE_REPOSITORY`, used by every use case in Tasks 4-7

- [ ] **Step 1: Create `apps/backend/src/modules/email-templates/infrastructure/email-template.orm-entity.ts`**

```typescript
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'email_templates' })
export class EmailTemplateOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  organizationId: string;

  @Column()
  name: string;

  @Column()
  subject: string;

  @Column('text')
  bodyHtml: string;

  @Column({ nullable: true })
  reminderStage: string | null;

  @Column({ default: false })
  isDefault: boolean;

  @Column()
  createdAt: Date;

  @Column()
  updatedAt: Date;
}
```

- [ ] **Step 2: Create `apps/backend/src/modules/email-templates/application/email-template-repository.port.ts`**

```typescript
import { EntityManager } from 'typeorm';
import { EmailTemplate } from '../domain/email-template';

export interface IEmailTemplateRepository {
  findById(id: string): Promise<EmailTemplate | null>;
  findAllForOrganization(): Promise<EmailTemplate[]>;
  save(template: EmailTemplate, manager?: EntityManager): Promise<void>;
  delete(id: string): Promise<void>;
  /**
   * Unscoped bulk insert — does NOT read organizationId from TenantContextService.
   * The only caller is DefaultOrganizationBootstrap's default-template seeding step
   * (auth module, Task 7 of this plan), which runs before any JWT/TenantContext exists for the
   * brand-new organization being created. Every other write path must use `save`.
   */
  saveMany(templates: EmailTemplate[], manager: EntityManager): Promise<void>;
}

export const EMAIL_TEMPLATE_REPOSITORY = Symbol('EMAIL_TEMPLATE_REPOSITORY');
```

- [ ] **Step 3: Create `apps/backend/src/modules/email-templates/infrastructure/typeorm-email-template.repository.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { EmailTemplate } from '../domain/email-template';
import { IEmailTemplateRepository } from '../application/email-template-repository.port';
import { EmailTemplateOrmEntity } from './email-template.orm-entity';
import { BaseRepository } from '../../../common/tenancy/base.repository';
import { TenantContextService } from '../../../common/tenancy/tenant-context';

@Injectable()
export class TypeOrmEmailTemplateRepository
  extends BaseRepository<EmailTemplateOrmEntity>
  implements IEmailTemplateRepository
{
  constructor(
    @InjectRepository(EmailTemplateOrmEntity) repo: Repository<EmailTemplateOrmEntity>,
    tenantContext: TenantContextService,
  ) {
    super(repo, tenantContext);
  }

  async findById(id: string): Promise<EmailTemplate | null> {
    const row = await this.scopedFindOne({ id } as any);
    return row ? new EmailTemplate(row) : null;
  }

  async findAllForOrganization(): Promise<EmailTemplate[]> {
    const organizationId = this.tenantContext.getOrganizationId();
    const rows = await this.ormRepo.find({ where: { organizationId } });
    return rows.map((row) => new EmailTemplate(row));
  }

  async save(template: EmailTemplate, manager?: EntityManager): Promise<void> {
    if (manager) {
      await manager.getRepository(EmailTemplateOrmEntity).save(template as unknown as EmailTemplateOrmEntity);
      return;
    }
    await this.scopedSave(template as unknown as EmailTemplateOrmEntity);
  }

  async delete(id: string): Promise<void> {
    const organizationId = this.tenantContext.getOrganizationId();
    await this.ormRepo.delete({ id, organizationId } as any);
  }

  async saveMany(templates: EmailTemplate[], manager: EntityManager): Promise<void> {
    await manager.getRepository(EmailTemplateOrmEntity).save(templates as unknown as EmailTemplateOrmEntity[]);
  }
}
```

- [ ] **Step 4: Create `apps/backend/src/modules/email-templates/email-templates.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailTemplateOrmEntity } from './infrastructure/email-template.orm-entity';
import { TypeOrmEmailTemplateRepository } from './infrastructure/typeorm-email-template.repository';
import { EMAIL_TEMPLATE_REPOSITORY } from './application/email-template-repository.port';

@Module({
  imports: [TypeOrmModule.forFeature([EmailTemplateOrmEntity])],
  providers: [{ provide: EMAIL_TEMPLATE_REPOSITORY, useClass: TypeOrmEmailTemplateRepository }],
  exports: [EMAIL_TEMPLATE_REPOSITORY],
})
export class EmailTemplatesModule {}
```

- [ ] **Step 5: Register `EmailTemplatesModule` in `apps/backend/src/app.module.ts`**

Add `EmailTemplatesModule` to the `imports` array (same pattern as every other feature module).

- [ ] **Step 6: Verify app still boots**

Run: `pnpm --filter @casso-ledger/backend test:e2e`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/email-templates apps/backend/src/app.module.ts
git commit -m "feat: add EmailTemplate TypeORM entity, tenant-scoped repository, and module"
```

---

### Task 3: Install `handlebars`, add `RenderEmailTemplateUseCase`

**Files:**
- Create: `apps/backend/src/modules/email-templates/application/render-email-template.usecase.ts`
- Test: `apps/backend/src/modules/email-templates/application/render-email-template.usecase.spec.ts`

**Interfaces:**
- Consumes: `EmailTemplate` domain class (Task 1), `handlebars` package
- Produces: `RenderEmailTemplateUseCase.render(template, data): RenderedEmail` — pure render helper, used by Task 6 (`PreviewEmailTemplateUseCase`) and referenced by `EmailService.sendReminderEmail` in `2026-08-03-email-notification-service-design.md` (out of scope for this plan, no code change there)

- [ ] **Step 1: Install `handlebars`**

Run: `pnpm --filter @casso-ledger/backend add handlebars`

- [ ] **Step 2: Write failing test — variable substitution and XSS auto-escaping**

Create `apps/backend/src/modules/email-templates/application/render-email-template.usecase.spec.ts`:

```typescript
import { EmailTemplate } from '../domain/email-template';
import { RenderEmailTemplateUseCase } from './render-email-template.usecase';

function buildTemplate(subject: string, bodyHtml: string): EmailTemplate {
  return new EmailTemplate({
    id: 'tpl-1',
    organizationId: 'org-1',
    name: 'Test template',
    subject,
    bodyHtml,
    reminderStage: null,
    isDefault: false,
    createdAt: new Date('2026-08-01'),
    updatedAt: new Date('2026-08-01'),
  });
}

describe('RenderEmailTemplateUseCase', () => {
  const useCase = new RenderEmailTemplateUseCase();

  it('substitutes all 7 fixed variables into subject and bodyHtml', () => {
    const template = buildTemplate(
      'Invoice {{invoiceNumber}} — {{organizationName}}',
      '<p>{{customerName}}, owes {{remainingAmount}} / {{originalAmount}}, due {{dueDate}}, {{daysOverdue}} days overdue</p>',
    );

    const result = useCase.render(template, {
      customerName: 'Company B',
      invoiceNumber: 'INV-001',
      originalAmount: 100,
      remainingAmount: 40,
      dueDate: '2026-08-10',
      daysOverdue: 5,
      organizationName: 'Casso Ledger',
    });

    expect(result.subject).toBe('Invoice INV-001 — Casso Ledger');
    expect(result.bodyHtml).toBe(
      '<p>Company B, owes 40 / 100, due 2026-08-10, 5 days overdue</p>',
    );
  });

  it('HTML-escapes variable values to prevent XSS (e.g. a customerName imported from Excel)', () => {
    const template = buildTemplate('Hello {{customerName}}', '<p>{{customerName}}</p>');

    const result = useCase.render(template, {
      customerName: '<script>alert(1)</script>',
      invoiceNumber: 'INV-001',
      originalAmount: 100,
      remainingAmount: 40,
      dueDate: '2026-08-10',
      daysOverdue: 5,
      organizationName: 'Casso Ledger',
    });

    expect(result.subject).toBe('Hello &lt;script&gt;alert(1)&lt;/script&gt;');
    expect(result.bodyHtml).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test render-email-template.usecase.spec.ts`
Expected: FAIL — Cannot find module './render-email-template.usecase'

- [ ] **Step 4: Create `apps/backend/src/modules/email-templates/application/render-email-template.usecase.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import * as Handlebars from 'handlebars';
import { EmailTemplate } from '../domain/email-template';

export interface EmailTemplateRenderData {
  customerName: string;
  invoiceNumber: string;
  originalAmount: number;
  remainingAmount: number;
  dueDate: string;
  daysOverdue: number;
  organizationName: string;
}

export interface RenderedEmail {
  subject: string;
  bodyHtml: string;
}

@Injectable()
export class RenderEmailTemplateUseCase {
  render(template: EmailTemplate, data: EmailTemplateRenderData): RenderedEmail {
    const subject = Handlebars.compile(template.subject)(data);
    const bodyHtml = Handlebars.compile(template.bodyHtml)(data);
    return { subject, bodyHtml };
  }
}
```

`Handlebars.compile` with the default `{{variable}}` syntax (not `{{{triple-stash}}}`) HTML-escapes every interpolated value automatically — this is the entire XSS defense described in spec section 3, no extra sanitization needed.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test render-email-template.usecase.spec.ts`
Expected: both tests PASS

- [ ] **Step 6: Commit**

```bash
git add apps/backend/package.json apps/backend/src/modules/email-templates/application/render-email-template.usecase.ts apps/backend/src/modules/email-templates/application/render-email-template.usecase.spec.ts
git commit -m "feat: add Handlebars-based RenderEmailTemplateUseCase with auto-escaping"
```

---

### Task 4: Create + List use cases, DTO, controller (`GET`/`POST /api/v1/email-templates`)

**Files:**
- Create: `apps/backend/src/modules/email-templates/application/create-email-template.usecase.ts`
- Create: `apps/backend/src/modules/email-templates/application/list-email-templates.usecase.ts`
- Create: `apps/backend/src/modules/email-templates/presentation/dto/create-email-template.dto.ts`
- Create: `apps/backend/src/modules/email-templates/presentation/email-templates.controller.ts`
- Modify: `apps/backend/src/modules/email-templates/email-templates.module.ts`
- Test: `apps/backend/src/modules/email-templates/application/create-email-template.usecase.spec.ts`
- Test: `apps/backend/src/modules/email-templates/application/list-email-templates.usecase.spec.ts`

**Interfaces:**
- Consumes: `IEmailTemplateRepository` (Task 2), `TenantContextService`, `JwtAuthGuard`/`PermissionGuard`/`RequirePermission`/`Permission` (`2026-08-03-multi-tenancy-rbac.md`)
- Produces: `GET /api/v1/email-templates`, `POST /api/v1/email-templates` (permission-gated), used by Task 8's integration test

- [ ] **Step 1: Write failing test for `CreateEmailTemplateUseCase`**

Create `apps/backend/src/modules/email-templates/application/create-email-template.usecase.spec.ts`:

```typescript
import { CreateEmailTemplateUseCase } from './create-email-template.usecase';

describe('CreateEmailTemplateUseCase', () => {
  it('creates a non-default template scoped to the current organization', async () => {
    const templateRepo = { save: jest.fn() };
    const tenantContext = { getOrganizationId: () => 'org-1' };

    const useCase = new CreateEmailTemplateUseCase(templateRepo as any, tenantContext as any);

    const result = await useCase.execute({
      name: 'Custom Reminder',
      subject: 'Hello {{customerName}}',
      bodyHtml: '<p>{{customerName}}</p>',
      reminderStage: null,
    });

    expect(result.organizationId).toBe('org-1');
    expect(result.isDefault).toBe(false);
    expect(templateRepo.save).toHaveBeenCalledWith(result);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test create-email-template.usecase.spec.ts`
Expected: FAIL — Cannot find module './create-email-template.usecase'

- [ ] **Step 3: Create `apps/backend/src/modules/email-templates/application/create-email-template.usecase.ts`**

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { EmailTemplate } from '../domain/email-template';
import { EMAIL_TEMPLATE_REPOSITORY, IEmailTemplateRepository } from './email-template-repository.port';
import { TenantContextService } from '../../../common/tenancy/tenant-context';

export interface CreateEmailTemplateInput {
  name: string;
  subject: string;
  bodyHtml: string;
  reminderStage: string | null;
}

@Injectable()
export class CreateEmailTemplateUseCase {
  constructor(
    @Inject(EMAIL_TEMPLATE_REPOSITORY) private readonly templateRepo: IEmailTemplateRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(input: CreateEmailTemplateInput): Promise<EmailTemplate> {
    const now = new Date();
    const template = new EmailTemplate({
      id: randomUUID(),
      organizationId: this.tenantContext.getOrganizationId(),
      name: input.name,
      subject: input.subject,
      bodyHtml: input.bodyHtml,
      reminderStage: input.reminderStage,
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    });

    await this.templateRepo.save(template);
    return template;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test create-email-template.usecase.spec.ts`
Expected: PASS

- [ ] **Step 5: Write failing test for `ListEmailTemplatesUseCase`**

Create `apps/backend/src/modules/email-templates/application/list-email-templates.usecase.spec.ts`:

```typescript
import { ListEmailTemplatesUseCase } from './list-email-templates.usecase';

describe('ListEmailTemplatesUseCase', () => {
  it('delegates to the repository for the current organization', async () => {
    const templates = [{ id: 'tpl-1' }];
    const templateRepo = { findAllForOrganization: jest.fn().mockResolvedValue(templates) };

    const useCase = new ListEmailTemplatesUseCase(templateRepo as any);
    const result = await useCase.execute();

    expect(result).toBe(templates);
    expect(templateRepo.findAllForOrganization).toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test list-email-templates.usecase.spec.ts`
Expected: FAIL — Cannot find module './list-email-templates.usecase'

- [ ] **Step 7: Create `apps/backend/src/modules/email-templates/application/list-email-templates.usecase.ts`**

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { EmailTemplate } from '../domain/email-template';
import { EMAIL_TEMPLATE_REPOSITORY, IEmailTemplateRepository } from './email-template-repository.port';

@Injectable()
export class ListEmailTemplatesUseCase {
  constructor(
    @Inject(EMAIL_TEMPLATE_REPOSITORY) private readonly templateRepo: IEmailTemplateRepository,
  ) {}

  async execute(): Promise<EmailTemplate[]> {
    return this.templateRepo.findAllForOrganization();
  }
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test list-email-templates.usecase.spec.ts`
Expected: PASS

- [ ] **Step 9: Create `apps/backend/src/modules/email-templates/presentation/dto/create-email-template.dto.ts`**

```typescript
import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateEmailTemplateDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @MinLength(1)
  subject: string;

  @IsString()
  @MinLength(1)
  bodyHtml: string;

  @IsOptional()
  @IsString()
  reminderStage?: string;
}
```

- [ ] **Step 10: Create `apps/backend/src/modules/email-templates/presentation/email-templates.controller.ts`**

```typescript
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CreateEmailTemplateUseCase } from '../application/create-email-template.usecase';
import { ListEmailTemplatesUseCase } from '../application/list-email-templates.usecase';
import { CreateEmailTemplateDto } from './dto/create-email-template.dto';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { Permission } from '../../../common/rbac/permission.enum';

@Controller('email-templates')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class EmailTemplatesController {
  constructor(
    private readonly createEmailTemplateUseCase: CreateEmailTemplateUseCase,
    private readonly listEmailTemplatesUseCase: ListEmailTemplatesUseCase,
  ) {}

  @Get()
  async list() {
    return this.listEmailTemplatesUseCase.execute();
  }

  @Post()
  @RequirePermission(Permission.REMINDER_POLICY_WRITE)
  async create(@Body() dto: CreateEmailTemplateDto) {
    return this.createEmailTemplateUseCase.execute({
      name: dto.name,
      subject: dto.subject,
      bodyHtml: dto.bodyHtml,
      reminderStage: dto.reminderStage ?? null,
    });
  }
}
```

`GET` has no `@RequirePermission` — `PermissionGuard` allows any authenticated role through when no metadata is set (same rule as every other read endpoint in this codebase), matching spec section 4, which only requires `REMINDER_POLICY_WRITE` on the write endpoints.

- [ ] **Step 11: Modify `apps/backend/src/modules/email-templates/email-templates.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailTemplateOrmEntity } from './infrastructure/email-template.orm-entity';
import { TypeOrmEmailTemplateRepository } from './infrastructure/typeorm-email-template.repository';
import { EMAIL_TEMPLATE_REPOSITORY } from './application/email-template-repository.port';
import { CreateEmailTemplateUseCase } from './application/create-email-template.usecase';
import { ListEmailTemplatesUseCase } from './application/list-email-templates.usecase';
import { EmailTemplatesController } from './presentation/email-templates.controller';

@Module({
  imports: [TypeOrmModule.forFeature([EmailTemplateOrmEntity])],
  controllers: [EmailTemplatesController],
  providers: [
    { provide: EMAIL_TEMPLATE_REPOSITORY, useClass: TypeOrmEmailTemplateRepository },
    CreateEmailTemplateUseCase,
    ListEmailTemplatesUseCase,
  ],
  exports: [EMAIL_TEMPLATE_REPOSITORY],
})
export class EmailTemplatesModule {}
```

- [ ] **Step 12: Run full test suite**

Run: `pnpm --filter @casso-ledger/backend test`
Expected: all PASS

- [ ] **Step 13: Commit**

```bash
git add apps/backend/src/modules/email-templates
git commit -m "feat: add create/list email template use cases and GET/POST endpoints"
```

---

### Task 5: Update + Delete use cases, `PATCH`/`DELETE /api/v1/email-templates/:id`

**Files:**
- Create: `apps/backend/src/modules/email-templates/application/update-email-template.usecase.ts`
- Create: `apps/backend/src/modules/email-templates/application/delete-email-template.usecase.ts`
- Create: `apps/backend/src/modules/email-templates/presentation/dto/update-email-template.dto.ts`
- Modify: `apps/backend/src/modules/email-templates/presentation/email-templates.controller.ts`
- Modify: `apps/backend/src/modules/email-templates/email-templates.module.ts`
- Test: `apps/backend/src/modules/email-templates/application/update-email-template.usecase.spec.ts`
- Test: `apps/backend/src/modules/email-templates/application/delete-email-template.usecase.spec.ts`

**Interfaces:**
- Consumes: `IEmailTemplateRepository` (Task 2), `EmailTemplate.updateContent` (Task 1), `DataSource` (TypeORM, already registered globally)
- Produces: `PATCH /api/v1/email-templates/:id`, `DELETE /api/v1/email-templates/:id` (409 guard), used by Task 8's integration test

- [ ] **Step 1: Write failing test for `UpdateEmailTemplateUseCase`**

Create `apps/backend/src/modules/email-templates/application/update-email-template.usecase.spec.ts`:

```typescript
import { EmailTemplate } from '../domain/email-template';
import { UpdateEmailTemplateUseCase } from './update-email-template.usecase';

describe('UpdateEmailTemplateUseCase', () => {
  it('updates subject/bodyHtml and persists the new version', async () => {
    const existing = new EmailTemplate({
      id: 'tpl-1',
      organizationId: 'org-1',
      name: '1 Day Overdue Reminder',
      subject: 'Old',
      bodyHtml: '<p>Old</p>',
      reminderStage: '1 Day Overdue Reminder',
      isDefault: true,
      createdAt: new Date('2026-08-01'),
      updatedAt: new Date('2026-08-01'),
    });
    const templateRepo = { findById: jest.fn().mockResolvedValue(existing), save: jest.fn() };

    const useCase = new UpdateEmailTemplateUseCase(templateRepo as any);
    const result = await useCase.execute({ id: 'tpl-1', subject: 'New', bodyHtml: '<p>New</p>' });

    expect(result.subject).toBe('New');
    expect(result.bodyHtml).toBe('<p>New</p>');
    expect(result.isDefault).toBe(true);
    expect(templateRepo.save).toHaveBeenCalledWith(result);
  });

  it('throws NotFoundException when the template does not exist', async () => {
    const templateRepo = { findById: jest.fn().mockResolvedValue(null), save: jest.fn() };
    const useCase = new UpdateEmailTemplateUseCase(templateRepo as any);

    await expect(useCase.execute({ id: 'missing', subject: 'x', bodyHtml: 'y' })).rejects.toThrow(
      'Email template not found',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test update-email-template.usecase.spec.ts`
Expected: FAIL — Cannot find module './update-email-template.usecase'

- [ ] **Step 3: Create `apps/backend/src/modules/email-templates/application/update-email-template.usecase.ts`**

```typescript
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EmailTemplate } from '../domain/email-template';
import { EMAIL_TEMPLATE_REPOSITORY, IEmailTemplateRepository } from './email-template-repository.port';

export interface UpdateEmailTemplateInput {
  id: string;
  subject?: string;
  bodyHtml?: string;
}

@Injectable()
export class UpdateEmailTemplateUseCase {
  constructor(
    @Inject(EMAIL_TEMPLATE_REPOSITORY) private readonly templateRepo: IEmailTemplateRepository,
  ) {}

  async execute(input: UpdateEmailTemplateInput): Promise<EmailTemplate> {
    const template = await this.templateRepo.findById(input.id);
    if (!template) {
      throw new NotFoundException('Email template not found');
    }

    const updated = template.updateContent(
      input.subject ?? template.subject,
      input.bodyHtml ?? template.bodyHtml,
    );
    await this.templateRepo.save(updated);
    return updated;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test update-email-template.usecase.spec.ts`
Expected: both tests PASS

- [ ] **Step 5: Write failing tests for `DeleteEmailTemplateUseCase`**

Create `apps/backend/src/modules/email-templates/application/delete-email-template.usecase.spec.ts`:

```typescript
import { EmailTemplate } from '../domain/email-template';
import { DeleteEmailTemplateUseCase } from './delete-email-template.usecase';

function buildTemplate(isDefault: boolean): EmailTemplate {
  return new EmailTemplate({
    id: 'tpl-1',
    organizationId: 'org-1',
    name: 'x',
    subject: 'x',
    bodyHtml: 'x',
    reminderStage: null,
    isDefault,
    createdAt: new Date('2026-08-01'),
    updatedAt: new Date('2026-08-01'),
  });
}

describe('DeleteEmailTemplateUseCase', () => {
  it('throws NotFoundException when the template does not exist', async () => {
    const templateRepo = { findById: jest.fn().mockResolvedValue(null), delete: jest.fn() };
    const dataSource = { query: jest.fn() };
    const useCase = new DeleteEmailTemplateUseCase(templateRepo as any, dataSource as any);

    await expect(useCase.execute('missing')).rejects.toThrow('Email template not found');
  });

  it('throws ConflictException when isDefault is true, without querying reminder rules', async () => {
    const templateRepo = { findById: jest.fn().mockResolvedValue(buildTemplate(true)), delete: jest.fn() };
    const dataSource = { query: jest.fn() };
    const useCase = new DeleteEmailTemplateUseCase(templateRepo as any, dataSource as any);

    await expect(useCase.execute('tpl-1')).rejects.toThrow('Cannot delete a default email template');
    expect(dataSource.query).not.toHaveBeenCalled();
    expect(templateRepo.delete).not.toHaveBeenCalled();
  });

  it('throws ConflictException when a reminder rule still references the template', async () => {
    const templateRepo = { findById: jest.fn().mockResolvedValue(buildTemplate(false)), delete: jest.fn() };
    const dataSource = { query: jest.fn().mockResolvedValue([{ count: 1 }]) };
    const useCase = new DeleteEmailTemplateUseCase(templateRepo as any, dataSource as any);

    await expect(useCase.execute('tpl-1')).rejects.toThrow(
      'Cannot delete an email template referenced by a reminder rule',
    );
    expect(templateRepo.delete).not.toHaveBeenCalled();
  });

  it('deletes the template when the reminder_rules table does not exist yet (Postgres 42P01)', async () => {
    const templateRepo = { findById: jest.fn().mockResolvedValue(buildTemplate(false)), delete: jest.fn() };
    const dataSource = { query: jest.fn().mockRejectedValue({ code: '42P01' }) };
    const useCase = new DeleteEmailTemplateUseCase(templateRepo as any, dataSource as any);

    await useCase.execute('tpl-1');

    expect(templateRepo.delete).toHaveBeenCalledWith('tpl-1');
  });

  it('deletes the template when no reminder rule references it', async () => {
    const templateRepo = { findById: jest.fn().mockResolvedValue(buildTemplate(false)), delete: jest.fn() };
    const dataSource = { query: jest.fn().mockResolvedValue([{ count: 0 }]) };
    const useCase = new DeleteEmailTemplateUseCase(templateRepo as any, dataSource as any);

    await useCase.execute('tpl-1');

    expect(templateRepo.delete).toHaveBeenCalledWith('tpl-1');
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `pnpm --filter @casso-ledger/backend test delete-email-template.usecase.spec.ts`
Expected: FAIL — Cannot find module './delete-email-template.usecase'

- [ ] **Step 7: Create `apps/backend/src/modules/email-templates/application/delete-email-template.usecase.ts`**

```typescript
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { EMAIL_TEMPLATE_REPOSITORY, IEmailTemplateRepository } from './email-template-repository.port';

const POSTGRES_UNDEFINED_TABLE_ERROR_CODE = '42P01';

@Injectable()
export class DeleteEmailTemplateUseCase {
  constructor(
    @Inject(EMAIL_TEMPLATE_REPOSITORY) private readonly templateRepo: IEmailTemplateRepository,
    private readonly dataSource: DataSource,
  ) {}

  async execute(id: string): Promise<void> {
    const template = await this.templateRepo.findById(id);
    if (!template) {
      throw new NotFoundException('Email template not found');
    }
    if (template.isDefault) {
      throw new ConflictException('Cannot delete a default email template');
    }

    const referenced = await this.isReferencedByReminderRule(id);
    if (referenced) {
      throw new ConflictException('Cannot delete an email template referenced by a reminder rule');
    }

    await this.templateRepo.delete(id);
  }

  // ASSUMPTION (see Self-Review Notes): assumes a `reminder_rules` table with an
  // `emailTemplateId` column, per section 2 of 2026-08-03-reminder-automation-design.md
  // (ReminderRule.emailTemplateId). That plan has not been implemented yet, so the
  // table may not exist. If it doesn't (Postgres error 42P01 "undefined_table"),
  // there is nothing that could reference this template yet — allow the delete.
  // Once the Reminder Automation plan creates the real table, this same query
  // starts enforcing the guard for real with no code change here.
  private async isReferencedByReminderRule(templateId: string): Promise<boolean> {
    try {
      const rows: Array<{ count: number }> = await this.dataSource.query(
        'SELECT COUNT(*)::int AS count FROM reminder_rules WHERE "emailTemplateId" = $1',
        [templateId],
      );
      return Number(rows[0]?.count ?? 0) > 0;
    } catch (error) {
      if ((error as { code?: string }).code === POSTGRES_UNDEFINED_TABLE_ERROR_CODE) {
        return false;
      }
      throw error;
    }
  }
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `pnpm --filter @casso-ledger/backend test delete-email-template.usecase.spec.ts`
Expected: all 5 tests PASS

- [ ] **Step 9: Create `apps/backend/src/modules/email-templates/presentation/dto/update-email-template.dto.ts`**

```typescript
import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateEmailTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  subject?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  bodyHtml?: string;
}
```

- [ ] **Step 10: Modify `apps/backend/src/modules/email-templates/presentation/email-templates.controller.ts`**

```typescript
import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CreateEmailTemplateUseCase } from '../application/create-email-template.usecase';
import { ListEmailTemplatesUseCase } from '../application/list-email-templates.usecase';
import { UpdateEmailTemplateUseCase } from '../application/update-email-template.usecase';
import { DeleteEmailTemplateUseCase } from '../application/delete-email-template.usecase';
import { CreateEmailTemplateDto } from './dto/create-email-template.dto';
import { UpdateEmailTemplateDto } from './dto/update-email-template.dto';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { Permission } from '../../../common/rbac/permission.enum';

@Controller('email-templates')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class EmailTemplatesController {
  constructor(
    private readonly createEmailTemplateUseCase: CreateEmailTemplateUseCase,
    private readonly listEmailTemplatesUseCase: ListEmailTemplatesUseCase,
    private readonly updateEmailTemplateUseCase: UpdateEmailTemplateUseCase,
    private readonly deleteEmailTemplateUseCase: DeleteEmailTemplateUseCase,
  ) {}

  @Get()
  async list() {
    return this.listEmailTemplatesUseCase.execute();
  }

  @Post()
  @RequirePermission(Permission.REMINDER_POLICY_WRITE)
  async create(@Body() dto: CreateEmailTemplateDto) {
    return this.createEmailTemplateUseCase.execute({
      name: dto.name,
      subject: dto.subject,
      bodyHtml: dto.bodyHtml,
      reminderStage: dto.reminderStage ?? null,
    });
  }

  @Patch(':id')
  @RequirePermission(Permission.REMINDER_POLICY_WRITE)
  async update(@Param('id') id: string, @Body() dto: UpdateEmailTemplateDto) {
    return this.updateEmailTemplateUseCase.execute({ id, subject: dto.subject, bodyHtml: dto.bodyHtml });
  }

  @Delete(':id')
  @RequirePermission(Permission.REMINDER_POLICY_WRITE)
  async remove(@Param('id') id: string) {
    await this.deleteEmailTemplateUseCase.execute(id);
    return { success: true };
  }
}
```

- [ ] **Step 11: Modify `apps/backend/src/modules/email-templates/email-templates.module.ts`**

Add `UpdateEmailTemplateUseCase` and `DeleteEmailTemplateUseCase` to `providers`:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailTemplateOrmEntity } from './infrastructure/email-template.orm-entity';
import { TypeOrmEmailTemplateRepository } from './infrastructure/typeorm-email-template.repository';
import { EMAIL_TEMPLATE_REPOSITORY } from './application/email-template-repository.port';
import { CreateEmailTemplateUseCase } from './application/create-email-template.usecase';
import { ListEmailTemplatesUseCase } from './application/list-email-templates.usecase';
import { UpdateEmailTemplateUseCase } from './application/update-email-template.usecase';
import { DeleteEmailTemplateUseCase } from './application/delete-email-template.usecase';
import { EmailTemplatesController } from './presentation/email-templates.controller';

@Module({
  imports: [TypeOrmModule.forFeature([EmailTemplateOrmEntity])],
  controllers: [EmailTemplatesController],
  providers: [
    { provide: EMAIL_TEMPLATE_REPOSITORY, useClass: TypeOrmEmailTemplateRepository },
    CreateEmailTemplateUseCase,
    ListEmailTemplatesUseCase,
    UpdateEmailTemplateUseCase,
    DeleteEmailTemplateUseCase,
  ],
  exports: [EMAIL_TEMPLATE_REPOSITORY],
})
export class EmailTemplatesModule {}
```

- [ ] **Step 12: Run full test suite**

Run: `pnpm --filter @casso-ledger/backend test`
Expected: all PASS

- [ ] **Step 13: Commit**

```bash
git add apps/backend/src/modules/email-templates
git commit -m "feat: add update/delete email template use cases with isDefault and reminder-rule guards"
```

---

### Task 6: Preview use case, `POST /api/v1/email-templates/:id/preview`

**Files:**
- Create: `apps/backend/src/modules/email-templates/application/preview-email-template.usecase.ts`
- Modify: `apps/backend/src/modules/email-templates/presentation/email-templates.controller.ts`
- Modify: `apps/backend/src/modules/email-templates/email-templates.module.ts`
- Test: `apps/backend/src/modules/email-templates/application/preview-email-template.usecase.spec.ts`

**Interfaces:**
- Consumes: `IEmailTemplateRepository` (Task 2), `RenderEmailTemplateUseCase` (Task 3)
- Produces: `POST /api/v1/email-templates/:id/preview` returning rendered `{ subject, bodyHtml }` from hard-coded sample data — resolves spec section 6's open question in favor of the simplest option (no real `Receivable` selection UI), used by Task 8's integration test

- [ ] **Step 1: Write failing test for `PreviewEmailTemplateUseCase`**

Create `apps/backend/src/modules/email-templates/application/preview-email-template.usecase.spec.ts`:

```typescript
import { EmailTemplate } from '../domain/email-template';
import { RenderEmailTemplateUseCase } from './render-email-template.usecase';
import { PreviewEmailTemplateUseCase } from './preview-email-template.usecase';

describe('PreviewEmailTemplateUseCase', () => {
  it('renders the template with hard-coded sample data', async () => {
    const template = new EmailTemplate({
      id: 'tpl-1',
      organizationId: 'org-1',
      name: 'x',
      subject: 'Hello {{customerName}}',
      bodyHtml: '<p>{{customerName}} owes {{remainingAmount}}</p>',
      reminderStage: null,
      isDefault: false,
      createdAt: new Date('2026-08-01'),
      updatedAt: new Date('2026-08-01'),
    });
    const templateRepo = { findById: jest.fn().mockResolvedValue(template) };
    const renderUseCase = new RenderEmailTemplateUseCase();

    const useCase = new PreviewEmailTemplateUseCase(templateRepo as any, renderUseCase);
    const result = await useCase.execute('tpl-1');

    expect(result.subject).toContain('Hello');
    expect(result.bodyHtml).toContain('owes');
  });

  it('throws NotFoundException when the template does not exist', async () => {
    const templateRepo = { findById: jest.fn().mockResolvedValue(null) };
    const useCase = new PreviewEmailTemplateUseCase(templateRepo as any, new RenderEmailTemplateUseCase());

    await expect(useCase.execute('missing')).rejects.toThrow('Email template not found');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @casso-ledger/backend test preview-email-template.usecase.spec.ts`
Expected: FAIL — Cannot find module './preview-email-template.usecase'

- [ ] **Step 3: Create `apps/backend/src/modules/email-templates/application/preview-email-template.usecase.ts`**

```typescript
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EMAIL_TEMPLATE_REPOSITORY, IEmailTemplateRepository } from './email-template-repository.port';
import {
  EmailTemplateRenderData,
  RenderedEmail,
  RenderEmailTemplateUseCase,
} from './render-email-template.usecase';

const SAMPLE_RENDER_DATA: EmailTemplateRenderData = {
  customerName: 'ABC Company Ltd.',
  invoiceNumber: 'INV-2026-0088',
  originalAmount: 50_000_000,
  remainingAmount: 20_000_000,
  dueDate: '2026-08-10',
  daysOverdue: 5,
  organizationName: 'Casso Ledger Demo',
};

@Injectable()
export class PreviewEmailTemplateUseCase {
  constructor(
    @Inject(EMAIL_TEMPLATE_REPOSITORY) private readonly templateRepo: IEmailTemplateRepository,
    private readonly renderUseCase: RenderEmailTemplateUseCase,
  ) {}

  async execute(id: string): Promise<RenderedEmail> {
    const template = await this.templateRepo.findById(id);
    if (!template) {
      throw new NotFoundException('Email template not found');
    }
    return this.renderUseCase.render(template, SAMPLE_RENDER_DATA);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @casso-ledger/backend test preview-email-template.usecase.spec.ts`
Expected: both tests PASS

- [ ] **Step 5: Modify `apps/backend/src/modules/email-templates/presentation/email-templates.controller.ts`**

Add the preview endpoint (gated the same as the other write-adjacent actions — previewing is part of the template-editing workflow, not a plain read):

```typescript
import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CreateEmailTemplateUseCase } from '../application/create-email-template.usecase';
import { ListEmailTemplatesUseCase } from '../application/list-email-templates.usecase';
import { UpdateEmailTemplateUseCase } from '../application/update-email-template.usecase';
import { DeleteEmailTemplateUseCase } from '../application/delete-email-template.usecase';
import { PreviewEmailTemplateUseCase } from '../application/preview-email-template.usecase';
import { CreateEmailTemplateDto } from './dto/create-email-template.dto';
import { UpdateEmailTemplateDto } from './dto/update-email-template.dto';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { Permission } from '../../../common/rbac/permission.enum';

@Controller('email-templates')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class EmailTemplatesController {
  constructor(
    private readonly createEmailTemplateUseCase: CreateEmailTemplateUseCase,
    private readonly listEmailTemplatesUseCase: ListEmailTemplatesUseCase,
    private readonly updateEmailTemplateUseCase: UpdateEmailTemplateUseCase,
    private readonly deleteEmailTemplateUseCase: DeleteEmailTemplateUseCase,
    private readonly previewEmailTemplateUseCase: PreviewEmailTemplateUseCase,
  ) {}

  @Get()
  async list() {
    return this.listEmailTemplatesUseCase.execute();
  }

  @Post()
  @RequirePermission(Permission.REMINDER_POLICY_WRITE)
  async create(@Body() dto: CreateEmailTemplateDto) {
    return this.createEmailTemplateUseCase.execute({
      name: dto.name,
      subject: dto.subject,
      bodyHtml: dto.bodyHtml,
      reminderStage: dto.reminderStage ?? null,
    });
  }

  @Patch(':id')
  @RequirePermission(Permission.REMINDER_POLICY_WRITE)
  async update(@Param('id') id: string, @Body() dto: UpdateEmailTemplateDto) {
    return this.updateEmailTemplateUseCase.execute({ id, subject: dto.subject, bodyHtml: dto.bodyHtml });
  }

  @Delete(':id')
  @RequirePermission(Permission.REMINDER_POLICY_WRITE)
  async remove(@Param('id') id: string) {
    await this.deleteEmailTemplateUseCase.execute(id);
    return { success: true };
  }

  @Post(':id/preview')
  @RequirePermission(Permission.REMINDER_POLICY_WRITE)
  async preview(@Param('id') id: string) {
    return this.previewEmailTemplateUseCase.execute(id);
  }
}
```

- [ ] **Step 6: Modify `apps/backend/src/modules/email-templates/email-templates.module.ts`**

Add `RenderEmailTemplateUseCase` and `PreviewEmailTemplateUseCase` to `providers`:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailTemplateOrmEntity } from './infrastructure/email-template.orm-entity';
import { TypeOrmEmailTemplateRepository } from './infrastructure/typeorm-email-template.repository';
import { EMAIL_TEMPLATE_REPOSITORY } from './application/email-template-repository.port';
import { CreateEmailTemplateUseCase } from './application/create-email-template.usecase';
import { ListEmailTemplatesUseCase } from './application/list-email-templates.usecase';
import { UpdateEmailTemplateUseCase } from './application/update-email-template.usecase';
import { DeleteEmailTemplateUseCase } from './application/delete-email-template.usecase';
import { RenderEmailTemplateUseCase } from './application/render-email-template.usecase';
import { PreviewEmailTemplateUseCase } from './application/preview-email-template.usecase';
import { EmailTemplatesController } from './presentation/email-templates.controller';

@Module({
  imports: [TypeOrmModule.forFeature([EmailTemplateOrmEntity])],
  controllers: [EmailTemplatesController],
  providers: [
    { provide: EMAIL_TEMPLATE_REPOSITORY, useClass: TypeOrmEmailTemplateRepository },
    CreateEmailTemplateUseCase,
    ListEmailTemplatesUseCase,
    UpdateEmailTemplateUseCase,
    DeleteEmailTemplateUseCase,
    RenderEmailTemplateUseCase,
    PreviewEmailTemplateUseCase,
  ],
  exports: [EMAIL_TEMPLATE_REPOSITORY],
})
export class EmailTemplatesModule {}
```

- [ ] **Step 7: Run full test suite**

Run: `pnpm --filter @casso-ledger/backend test`
Expected: all PASS

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/modules/email-templates
git commit -m "feat: add preview email template use case and POST /email-templates/:id/preview endpoint"
```

---

### Task 7: Seed 4 default templates on signup

**Files:**
- Create: `apps/backend/src/modules/email-templates/application/seed-default-email-templates.ts`
- Modify: `apps/backend/src/modules/auth/infrastructure/default-organization-bootstrap.adapter.ts`
- Test: `apps/backend/src/modules/auth/infrastructure/default-organization-bootstrap.adapter.spec.ts`

**Interfaces:**
- Consumes: `EmailTemplate` domain class (Task 1), `IEmailTemplateRepository.saveMany` (Task 2), `IDefaultReminderBootstrap` (Reminder Automation plan)
- Produces: `buildDefaultEmailTemplates(organizationId, now)` and the adapter implementation consumed by Auth's single `DEFAULT_ORGANIZATION_BOOTSTRAP` seam; Signup itself is owned only by `2026-08-03-authentication-onboarding.md`

- [ ] **Step 1: Create `apps/backend/src/modules/email-templates/application/seed-default-email-templates.ts`**

```typescript
import { randomUUID } from 'crypto';
import { EmailTemplate } from '../domain/email-template';

interface DefaultTemplateDefinition {
  name: string;
  reminderStage: string;
  subject: string;
  bodyHtml: string;
}

const DEFAULT_TEMPLATE_DEFINITIONS: DefaultTemplateDefinition[] = [
  {
    name: '3 Day Pre-Due Reminder',
    reminderStage: '3 Day Pre-Due Reminder',
    subject: 'Payment reminder for invoice {{invoiceNumber}}',
    bodyHtml:
      '<p>Dear {{customerName}},</p>' +
      '<p>Invoice {{invoiceNumber}} with remaining amount {{remainingAmount}} is due on {{dueDate}}. ' +
      'Please arrange payment by the due date.</p>' +
      '<p>Sincerely,<br/>{{organizationName}}</p>',
  },
  {
    name: '1 Day Overdue Reminder',
    reminderStage: '1 Day Overdue Reminder',
    subject: 'Invoice {{invoiceNumber}} is overdue for payment',
    bodyHtml:
      '<p>Dear {{customerName}},</p>' +
      '<p>Invoice {{invoiceNumber}} is {{daysOverdue}} days overdue for payment, with remaining amount {{remainingAmount}}. ' +
      'Please make payment as soon as possible.</p>' +
      '<p>Sincerely,<br/>{{organizationName}}</p>',
  },
  {
    name: '7 Day Overdue Reminder',
    reminderStage: '7 Day Overdue Reminder',
    subject: 'Reminder 2: Invoice {{invoiceNumber}} is {{daysOverdue}} days overdue',
    bodyHtml:
      '<p>Dear {{customerName}},</p>' +
      '<p>Invoice {{invoiceNumber}} is now {{daysOverdue}} days overdue, with remaining amount {{remainingAmount}}. ' +
      'This is the second reminder; please complete payment soon.</p>' +
      '<p>Sincerely,<br/>{{organizationName}}</p>',
  },
  {
    name: '30 Day Overdue Reminder',
    reminderStage: '30 Day Overdue Reminder',
    subject: 'Urgent: Invoice {{invoiceNumber}} is {{daysOverdue}} days overdue',
    bodyHtml:
      '<p>Dear {{customerName}},</p>' +
      '<p>Invoice {{invoiceNumber}} is {{daysOverdue}} days overdue for payment, with remaining amount {{remainingAmount}}. ' +
      'Please contact {{organizationName}} accounts receivable as soon as possible to resolve this.</p>' +
      '<p>Sincerely,<br/>{{organizationName}}</p>',
  },
];

export function buildDefaultEmailTemplates(organizationId: string, now: Date): EmailTemplate[] {
  return DEFAULT_TEMPLATE_DEFINITIONS.map(
    (definition) =>
      new EmailTemplate({
        id: randomUUID(),
        organizationId,
        name: definition.name,
        subject: definition.subject,
        bodyHtml: definition.bodyHtml,
        reminderStage: definition.reminderStage,
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      }),
  );
}
```

These 4 definitions match spec section 2's example stages exactly ("3 Day Pre-Due Reminder", "1 Day Overdue Reminder", "7 Day Overdue Reminder", "30 Day Overdue Reminder") — the Reminder Automation plan's default `ReminderPolicy`/`ReminderRule` seed will point its `emailTemplateId` at these same 4 rows by matching on `reminderStage`.

> **Cross-plan reconciliation:** `SignupUseCase` and `AuthModule` are implemented only by `2026-08-03-authentication-onboarding.md`. The adapter below is the sole bridge: it seeds templates and delegates reminder policies/rules to `IDefaultReminderBootstrap` with the same `EntityManager`. Do not apply an older version of this section that injected `IEmailTemplateRepository` directly into `SignupUseCase`; that would create a second bootstrap path and a constructor mismatch.

- [ ] **Step 2: Keep the adapter implementation aligned with the Authentication plan**

The authoritative implementation is `DefaultOrganizationBootstrap` from `2026-08-03-authentication-onboarding.md` Task 2: it calls `buildDefaultEmailTemplates`, `IEmailTemplateRepository.saveMany(templates, manager)`, then `IDefaultReminderBootstrap.seed(organizationId, templates, now, manager)`. Do not inject either repository into `SignupUseCase`; Auth owns that single bootstrap seam.

- [ ] **Step 3: Write the adapter unit test**

Create `apps/backend/src/modules/auth/infrastructure/default-organization-bootstrap.adapter.spec.ts`. Mock the template repository and reminder bootstrap, invoke `seed(organizationId, manager)`, and assert that `saveMany` and `seed` each receive the same `EntityManager`, the same organization ID, and four default templates with `isDefault=true`. Also assert that template seeding happens before reminder seeding.

- [ ] **Step 4: Run the focused test**

Run: `pnpm --filter @casso-ledger/backend test default-organization-bootstrap.adapter.spec.ts`

Expected: PASS after the Authentication plan's adapter implementation is present.

- [ ] **Step 5: Verify the cross-plan signup contract**

Run: `pnpm --filter @casso-ledger/backend test signup.usecase.spec.ts`

The signup test belongs to the Authentication plan and must construct `SignupUseCase` with `ISubscriptionRepository`, `IOrganizationBootstrap`, `IAuthEmailSender`, `LoginUseCase`, and `DataSource`. This email plan must not add another Signup constructor or bootstrap path.

- [ ] **Step 6: Verify integration and commit**

Run: `pnpm --filter @casso-ledger/backend test && pnpm --filter @casso-ledger/backend test:e2e`

Expected: all tests PASS; commit only the seed utility, adapter wiring/test, and this plan's changes.
---

### Task 8: Integration test — full CRUD + preview flow against a real Postgres

**Files:**
- Create: `apps/backend/test/email-templates.integration.spec.ts`

**Interfaces:**
- Consumes: full `AppModule` (signup → seeding → CRUD → preview, Tasks 1-7), testcontainers `PostgreSqlContainer`, supertest
- Produces: end-to-end proof that signup seeds 4 default templates, a custom template can be created/previewed/updated/deleted, a default template's delete is blocked with 409, and `ACCOUNTANT` is rejected from write endpoints by RBAC

- [ ] **Step 1: Write the integration test**

Create `apps/backend/test/email-templates.integration.spec.ts`:

```typescript
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

describe('Email Template Management (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;
  let organizationId: string;

  function tokenFor(role: string): string {
    return jwtService.sign({ userId: 'user-1', organizationId, role });
  }

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16').start();
    process.env.DB_HOST = container.getHost();
    process.env.DB_PORT = String(container.getMappedPort(5432));
    process.env.DB_USERNAME = container.getUsername();
    process.env.DB_PASSWORD = container.getPassword();
    process.env.DB_DATABASE = container.getDatabase();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    dataSource = moduleRef.get(DataSource);
    jwtService = moduleRef.get(JwtService);
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await container.stop();
  });

  it('seeds 4 default templates when a new Organization signs up', async () => {
    const signupResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({ organizationName: 'Test Company', email: 'owner@test-org.vn', password: 'S3curePass!' })
      .expect(201);

    organizationId = signupResponse.body.organizationId;
    const token = jwtService.sign({
      userId: signupResponse.body.userId,
      organizationId,
      role: 'OWNER',
    });

    const listResponse = await request(app.getHttpServer())
      .get('/api/v1/email-templates')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(listResponse.body).toHaveLength(4);
    expect(listResponse.body.every((t: { isDefault: boolean }) => t.isDefault === true)).toBe(true);
  });

  it('creates, previews, updates, and deletes a custom email template end-to-end', async () => {
    const token = tokenFor('OWNER');

    const createResponse = await request(app.getHttpServer())
      .post('/api/v1/email-templates')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Custom Payment Reminder',
        subject: 'Hello {{customerName}}',
        bodyHtml: '<p>{{customerName}} still owes {{remainingAmount}} for invoice {{invoiceNumber}}</p>',
      })
      .expect(201);

    const templateId = createResponse.body.id;
    expect(createResponse.body.isDefault).toBe(false);

    const previewResponse = await request(app.getHttpServer())
      .post(`/api/v1/email-templates/${templateId}/preview`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    expect(previewResponse.body.subject).toBe('Hello ABC Company Ltd.');
    expect(previewResponse.body.bodyHtml).toContain('ABC Company Ltd.');

    await request(app.getHttpServer())
      .patch(`/api/v1/email-templates/${templateId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ subject: 'Updated: {{invoiceNumber}}' })
      .expect(200);

    const rowAfterUpdate = await dataSource.query('SELECT subject FROM email_templates WHERE id = $1', [
      templateId,
    ]);
    expect(rowAfterUpdate[0].subject).toBe('Updated: {{invoiceNumber}}');

    await request(app.getHttpServer())
      .delete(`/api/v1/email-templates/${templateId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const rowAfterDelete = await dataSource.query('SELECT id FROM email_templates WHERE id = $1', [
      templateId,
    ]);
    expect(rowAfterDelete).toHaveLength(0);
  });

  it('blocks deleting a default template with 409', async () => {
    const token = tokenFor('OWNER');

    const listResponse = await request(app.getHttpServer())
      .get('/api/v1/email-templates')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const defaultTemplate = listResponse.body.find((t: { isDefault: boolean }) => t.isDefault);

    await request(app.getHttpServer())
      .delete(`/api/v1/email-templates/${defaultTemplate.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(409);
  });

  it('rejects ACCOUNTANT role from creating an email template with 403', async () => {
    const tokenAccountant = tokenFor('ACCOUNTANT');

    await request(app.getHttpServer())
      .post('/api/v1/email-templates')
      .set('Authorization', `Bearer ${tokenAccountant}`)
      .send({ name: 'x', subject: 'x', bodyHtml: 'x' })
      .expect(403);
  });
});
```

- [ ] **Step 2: Run the integration test**

Run: `pnpm --filter @casso-ledger/backend test:e2e -- email-templates.integration.spec.ts`
Expected: all 4 tests PASS (run in order — test 1 sets `organizationId` used by tests 2-4)

- [ ] **Step 3: Commit**

```bash
git add apps/backend/test/email-templates.integration.spec.ts
git commit -m "test: add integration test for email template CRUD, preview, and signup seeding"
```

---

## Self-Review Notes

- **Spec coverage:**
  - Entity shape (spec section 1) → Task 1 (`EmailTemplate` domain) + Task 2 (`EmailTemplateOrmEntity`). No version/history table, per spec section 1's explicit "sufficient for MVP" — not implemented, matches scope.
  - Seed on Organization creation (spec section 2) → Task 7 (`buildDefaultEmailTemplates` + `DefaultOrganizationBootstrap` adapter). `isDefault=true` content-editable-but-not-deletable rule (spec section 2) → Task 1 (`updateContent` has no `isDefault` guard) + Task 5 (`DeleteEmailTemplateUseCase` blocks on `isDefault`).
  - Handlebars render + fixed 7-variable closed set + auto-escaping (spec section 3) → Task 3 (`RenderEmailTemplateUseCase`), verified against XSS in its unit test.
  - Full CRUD + preview API (spec section 4) → Task 4 (`GET`/`POST /api/v1/email-templates`), Task 5 (`PATCH`/`DELETE /api/v1/email-templates/:id` with the 409 guard), Task 6 (`POST /api/v1/email-templates/:id/preview` returning `{ subject, bodyHtml }`). Every write route uses `Permission.REMINDER_POLICY_WRITE`.
  - Out of scope (spec section 5): no drag-drop editor, no i18n, no versioning — none implemented, matches scope.
  - Open questions (spec section 6) resolved for this MVP: kept the 7 variables as-is (no `{{paymentLink}}` — no payment gateway exists yet); `POST /:id/preview` uses hard-coded sample data (Task 6), not a real `Receivable` selection, since no such UI/endpoint exists yet — flagged here as the explicit decision, revisit if a future plan wants "preview with a real receivable."

- **Cross-plan contract:** `DeleteEmailTemplateUseCase.isReferencedByReminderRule` queries `reminder_rules.emailTemplateId`, the binding defined by the Reminder Automation spec. A missing table is only a pre-implementation fixture condition; production migrations must create the table before this module is enabled.

- **Type consistency checked:**
  - `EmailTemplateProps` (Task 1) is the single source of truth used identically by `EmailTemplateOrmEntity` (Task 2, same field names so `new EmailTemplate(row)` and `scopedSave(template as unknown as EmailTemplateOrmEntity)` line up), every use case's input/output types (Tasks 4-7), and the integration test's raw SQL assertions (Task 8, `email_templates` table / column names match `@Column()` field names exactly since no `@Column({ name: ... })` overrides are used, consistent with every other ORM entity in this codebase).
  - `IEmailTemplateRepository` (Task 2) is consumed identically by `EmailTemplatesModule` (Tasks 2, 4, 5, 6) and by `DefaultOrganizationBootstrap` (Task 7) via the same `EMAIL_TEMPLATE_REPOSITORY` DI token — no duplicate token, no divergent interface.
  - `RenderEmailTemplateUseCase.render(template, data)` (Task 3) is called with the exact same `EmailTemplateRenderData` shape by `PreviewEmailTemplateUseCase` (Task 6); the future `EmailService.sendReminderEmail` (`2026-08-03-email-notification-service-design.md`, out of scope here) is expected to build the same 7-field object from a real `Receivable`/`Customer`/`Organization` at send time.
  - `SignupUseCase` uses the Authentication plan's single `IOrganizationBootstrap` dependency after `ISubscriptionRepository`; the adapter test owns template/reminder seeding assertions, while the signup test owns transaction rollback.


