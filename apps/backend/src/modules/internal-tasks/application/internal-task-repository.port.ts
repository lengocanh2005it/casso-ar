import type { EntityManager } from 'typeorm';
import type { InternalTask } from '../domain/internal-task';

export interface IInternalTaskRepository {
  findById(id: string, manager?: EntityManager): Promise<InternalTask | null>;
  findPageByReceivableId(
    receivableId: string,
    page: number,
    limit: number,
  ): Promise<{ items: InternalTask[]; total: number }>;
  findOpenByReceivableId(
    receivableId: string,
    manager?: EntityManager,
  ): Promise<InternalTask[]>;
  createEscalationIfAbsent(
    task: InternalTask,
    manager?: EntityManager,
  ): Promise<boolean>;
  dismissOpenByReceivableId(
    receivableId: string,
    manager: EntityManager,
  ): Promise<void>;
  save(task: InternalTask, manager?: EntityManager): Promise<void>;
}

export const INTERNAL_TASK_REPOSITORY = Symbol('INTERNAL_TASK_REPOSITORY');
