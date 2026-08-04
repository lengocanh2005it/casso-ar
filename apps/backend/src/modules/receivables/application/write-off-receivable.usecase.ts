import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
// biome-ignore lint/style/useImportType: must be a value import — NestJS DI resolves this constructor param via emitDecoratorMetadata's design:paramtypes, which erases type-only imports to `Function`
import { DataSource } from 'typeorm';
import type { Receivable } from '../domain/receivable';
import { ErrorCode } from '../../../common/errors/error-code';
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
        throw new NotFoundException({
          statusCode: 404,
          errorCode: ErrorCode.RECEIVABLE_NOT_FOUND,
          message: 'Không tìm thấy khoản phải thu.',
        });
      }
      const updated = receivable.writeOff();
      await this.receivableRepo.save(updated, manager);
      return updated;
    });
  }
}
