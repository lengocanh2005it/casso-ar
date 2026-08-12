import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import { isUniqueViolation } from '../../../common/database/unique-violation';
import { BaseRepository } from '../../../common/tenancy/base.repository';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { IInternalTaskRepository } from '../application/internal-task-repository.port';
import { InternalTask } from '../domain/internal-task';
import { InternalTaskOrmEntity } from './internal-task.orm-entity';

const INTERNAL_TASK_SELECT = {
  id: true,
  organizationId: true,
  receivableId: true,
  assignedToUserId: true,
  createdByUserId: true,
  taskType: true,
  title: true,
  description: true,
  dueDate: true,
  status: true,
  createdAt: true,
  resolvedAt: true,
  version: true,
};

function toOrm(task: InternalTask): InternalTaskOrmEntity {
  return {
    id: task.id,
    organizationId: task.organizationId,
    receivableId: task.receivableId,
    assignedToUserId: task.assignedToUserId,
    createdByUserId: task.createdByUserId,
    taskType: task.taskType,
    title: task.title,
    description: task.description,
    dueDate: task.dueDate,
    status: task.status,
    createdAt: task.createdAt,
    resolvedAt: task.resolvedAt,
    version: task.version,
  };
}

function toDomain(row: InternalTaskOrmEntity): InternalTask {
  return new InternalTask({
    id: row.id,
    organizationId: row.organizationId,
    receivableId: row.receivableId,
    assignedToUserId: row.assignedToUserId,
    createdByUserId: row.createdByUserId,
    taskType: row.taskType,
    title: row.title,
    description: row.description,
    dueDate: row.dueDate,
    status: row.status,
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
    version: row.version,
  });
}

@Injectable()
export class TypeOrmInternalTaskRepository
  extends BaseRepository<InternalTaskOrmEntity>
  implements IInternalTaskRepository
{
  constructor(
    @InjectRepository(InternalTaskOrmEntity)
    repo: Repository<InternalTaskOrmEntity>,
    tenantContext: TenantContextService,
  ) {
    super(repo, tenantContext);
  }

  async findById(
    id: string,
    manager?: EntityManager,
  ): Promise<InternalTask | null> {
    const organizationId = this.tenantContext.getOrganizationId();
    const repo = manager
      ? manager.getRepository(InternalTaskOrmEntity)
      : this.ormRepo;
    const row = await repo.findOne({
      where: { id, organizationId },
      select: INTERNAL_TASK_SELECT,
      ...(manager ? { lock: { mode: 'pessimistic_write' } } : {}),
    });
    return row ? toDomain(row) : null;
  }

  async findPageByReceivableId(
    receivableId: string,
    page: number,
    limit: number,
  ): Promise<{ items: InternalTask[]; total: number }> {
    const [rows, total] = await Promise.all([
      this.scopedFindMany(
        { receivableId },
        {
          select: INTERNAL_TASK_SELECT,
          order: { createdAt: 'DESC' },
          skip: (page - 1) * limit,
          take: limit,
        },
      ),
      this.ormRepo.count({
        where: {
          organizationId: this.tenantContext.getOrganizationId(),
          receivableId,
        },
      }),
    ]);
    return { items: rows.map(toDomain), total };
  }

  async findOpenByReceivableId(
    receivableId: string,
    manager?: EntityManager,
  ): Promise<InternalTask[]> {
    const organizationId = this.tenantContext.getOrganizationId();
    const repo = manager
      ? manager.getRepository(InternalTaskOrmEntity)
      : this.ormRepo;
    const rows = await repo.find({
      where: { organizationId, receivableId, status: 'OPEN' },
      select: INTERNAL_TASK_SELECT,
      order: { createdAt: 'ASC' },
      ...(manager ? { lock: { mode: 'pessimistic_write' } } : {}),
    });
    return rows.map(toDomain);
  }

  async createEscalationIfAbsent(
    task: InternalTask,
    manager?: EntityManager,
  ): Promise<boolean> {
    const organizationId = this.tenantContext.getOrganizationId();
    if (task.organizationId !== organizationId) {
      throw new Error('TENANT_MISMATCH');
    }
    const repo = manager
      ? manager.getRepository(InternalTaskOrmEntity)
      : this.ormRepo;

    try {
      await repo.insert(toOrm(task));
      return true;
    } catch (error) {
      if (isUniqueViolation(error)) {
        return false;
      }
      throw error;
    }
  }

  async dismissOpenByReceivableId(
    receivableId: string,
    manager: EntityManager,
  ): Promise<void> {
    const organizationId = this.tenantContext.getOrganizationId();
    await manager.getRepository(InternalTaskOrmEntity).update(
      { organizationId, receivableId, status: 'OPEN' },
      {
        status: 'DISMISSED',
        resolvedAt: new Date(),
        version: () => '"version" + 1',
      },
    );
  }

  async save(task: InternalTask, manager?: EntityManager): Promise<void> {
    await this.scopedSaveWithManager(toOrm(task), manager);
  }
}
