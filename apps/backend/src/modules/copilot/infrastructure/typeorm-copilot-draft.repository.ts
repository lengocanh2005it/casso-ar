import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
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

  async save(draft: CopilotDraft, manager?: EntityManager): Promise<void> {
    await this.scopedSaveWithManager(toOrm(draft), manager);
  }

  async findById(id: string): Promise<CopilotDraft | null> {
    const row = await this.scopedFindOne({ id });
    return row ? toDomain(row) : null;
  }

  async findByIdForUpdate(
    id: string,
    manager: EntityManager,
  ): Promise<CopilotDraft | null> {
    const organizationId = this.tenantContext.getOrganizationId();
    const row = await manager.findOne(CopilotDraftOrmEntity, {
      where: { id, organizationId },
      lock: { mode: 'pessimistic_write' },
    });
    return row ? toDomain(row) : null;
  }

  async findAllForUser(userId: string): Promise<CopilotDraft[]> {
    const rows = await this.scopedFindMany(
      { userId },
      { order: { createdAt: 'DESC' } },
    );
    return rows.map(toDomain);
  }

  async delete(id: string, manager?: EntityManager): Promise<void> {
    const organizationId = this.tenantContext.getOrganizationId();
    const repo = manager
      ? manager.getRepository(CopilotDraftOrmEntity)
      : this.ormRepo;
    await repo.delete({ id, organizationId });
  }
}
