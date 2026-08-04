import { Inject, Injectable } from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';
import type { Receivable } from '../domain/receivable';
import {
  type IReceivableRepository,
  RECEIVABLE_REPOSITORY,
} from './receivable-repository.port';

@Injectable()
export class WriteOffReceivableUseCase {
  constructor(
    @Inject(RECEIVABLE_REPOSITORY)
    private readonly receivableRepo: IReceivableRepository,
    private readonly dataSource: DataSource,
  ) {}

  async execute(receivableId: string): Promise<Receivable> {
    return this.dataSource.transaction(async (manager: EntityManager) => {
      const receivable = await this.receivableRepo.findByIdForUpdate(
        receivableId,
        manager,
      );
      if (!receivable) {
        throw new Error('Receivable not found');
      }
      const updated = receivable.writeOff();
      await this.receivableRepo.save(updated, manager);
      return updated;
    });
  }
}
