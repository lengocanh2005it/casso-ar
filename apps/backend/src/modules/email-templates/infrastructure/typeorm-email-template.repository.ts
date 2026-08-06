import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, FindOptionsWhere, Repository } from 'typeorm';
import { BaseRepository } from '../../../common/tenancy/base.repository';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type {
  IEmailTemplateRepository,
  ListEmailTemplatesPagination,
} from '../application/email-template-repository.port';
import { EmailTemplate } from '../domain/email-template';
import { EmailTemplateOrmEntity } from './email-template.orm-entity';

// Explicit domain → ORM translation: the compiler checks every field, so a
// drift between the two shapes fails here instead of being cast away.
function toOrm(template: EmailTemplate): EmailTemplateOrmEntity {
  return {
    id: template.id,
    organizationId: template.organizationId,
    name: template.name,
    subject: template.subject,
    bodyHtml: template.bodyHtml,
    reminderStage: template.reminderStage,
    isDefault: template.isDefault,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
    version: template.version,
  };
}

@Injectable()
export class TypeOrmEmailTemplateRepository
  extends BaseRepository<EmailTemplateOrmEntity>
  implements IEmailTemplateRepository
{
  constructor(
    @InjectRepository(EmailTemplateOrmEntity)
    repo: Repository<EmailTemplateOrmEntity>,
    tenantContext: TenantContextService,
  ) {
    super(repo, tenantContext);
  }

  async findById(id: string): Promise<EmailTemplate | null> {
    const row = await this.scopedFindOne({
      id,
    } as FindOptionsWhere<EmailTemplateOrmEntity>);
    return row ? new EmailTemplate(row) : null;
  }

  async findAllForOrganization(
    pagination: ListEmailTemplatesPagination,
  ): Promise<EmailTemplate[]> {
    const rows = await this.scopedFindMany(
      {},
      {
        select: {
          id: true,
          organizationId: true,
          name: true,
          subject: true,
          bodyHtml: true,
          reminderStage: true,
          isDefault: true,
          createdAt: true,
          updatedAt: true,
          version: true,
        },
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
      },
    );
    return rows.map((row) => new EmailTemplate(row));
  }

  async save(template: EmailTemplate, manager?: EntityManager): Promise<void> {
    await this.scopedSaveWithManager(toOrm(template), manager);
  }

  async delete(id: string): Promise<void> {
    await this.scopedDelete({
      id,
    } as FindOptionsWhere<EmailTemplateOrmEntity>);
  }

  async saveMany(
    templates: EmailTemplate[],
    manager: EntityManager,
  ): Promise<void> {
    await manager
      .getRepository(EmailTemplateOrmEntity)
      .save(templates.map(toOrm));
  }
}
