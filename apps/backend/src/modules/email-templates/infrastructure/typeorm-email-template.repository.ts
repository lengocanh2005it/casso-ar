import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, FindOptionsWhere, Repository } from 'typeorm';
import { BaseRepository } from '../../../common/tenancy/base.repository';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { IEmailTemplateRepository } from '../application/email-template-repository.port';
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

  async findAllForOrganization(): Promise<EmailTemplate[]> {
    const organizationId = this.tenantContext.getOrganizationId();
    const rows = await this.ormRepo.find({ where: { organizationId } });
    return rows.map((row) => new EmailTemplate(row));
  }

  async save(template: EmailTemplate, manager?: EntityManager): Promise<void> {
    await this.scopedSaveWithManager(toOrm(template), manager);
  }

  async delete(id: string): Promise<void> {
    const organizationId = this.tenantContext.getOrganizationId();
    await this.ormRepo.delete({ id, organizationId });
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
