import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseRepository } from '../../../common/tenancy/base.repository';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type {
  CopilotDraft,
  ICopilotDraftRepository,
} from '../application/draft-repository.port';
import { CopilotDraftOrmEntity } from './copilot-draft.orm-entity';

function toOrm(draft: CopilotDraft): CopilotDraftOrmEntity {
  return {
    id: draft.id,
    organizationId: draft.organizationId,
    userId: draft.userId,
    receivableId: draft.receivableId,
    recipientEmail: draft.recipientEmail,
    subject: draft.subject,
    bodyHtml: draft.bodyHtml,
    createdAt: draft.createdAt,
  };
}

function toDomain(row: CopilotDraftOrmEntity): CopilotDraft {
  return {
    id: row.id,
    organizationId: row.organizationId,
    userId: row.userId,
    receivableId: row.receivableId,
    recipientEmail: row.recipientEmail,
    subject: row.subject,
    bodyHtml: row.bodyHtml,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class TypeOrmCopilotDraftRepository
  extends BaseRepository<CopilotDraftOrmEntity>
  implements ICopilotDraftRepository
{
  constructor(
    @InjectRepository(CopilotDraftOrmEntity)
    repo: Repository<CopilotDraftOrmEntity>,
    tenantContext: TenantContextService,
  ) {
    super(repo, tenantContext);
  }

  async save(draft: CopilotDraft): Promise<void> {
    await this.scopedSaveWithManager(toOrm(draft));
  }

  async findById(id: string): Promise<CopilotDraft | null> {
    const row = await this.scopedFindOne({ id });
    return row ? toDomain(row) : null;
  }

  async findAllForUser(userId: string): Promise<CopilotDraft[]> {
    const organizationId = this.tenantContext.getOrganizationId();
    const rows = await this.ormRepo.find({
      where: { organizationId, userId },
      order: { createdAt: 'DESC' },
    });
    return rows.map(toDomain);
  }
}
