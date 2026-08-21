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
