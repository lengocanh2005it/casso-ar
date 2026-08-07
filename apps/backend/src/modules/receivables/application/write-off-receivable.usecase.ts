import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { DataSource } from 'typeorm';
import { AuditContextService } from '../../../common/audit/audit-context';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
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
    private readonly auditContext: AuditContextService,
  ) {}

  async execute(receivableId: string): Promise<Receivable> {
    return this.dataSource.transaction(async (manager: EntityManager) => {
      const receivable = await this.receivableRepo.findByIdForUpdate(
        receivableId,
        manager,
      );
      if (!receivable) {
        throw new AppError(
          ErrorCode.RECEIVABLE_NOT_FOUND,
          'Không tìm thấy khoản phải thu.',
        );
      }
      this.auditContext.setBefore(receivable);
      const updated = receivable.writeOff();
      await this.receivableRepo.save(updated, manager);
      return updated;
    });
  }
}
