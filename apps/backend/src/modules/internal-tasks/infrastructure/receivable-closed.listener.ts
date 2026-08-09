import { Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { Role } from '../../organizations/domain/membership';
import {
  type IInternalTaskRepository,
  INTERNAL_TASK_REPOSITORY,
} from '../application/internal-task-repository.port';

export interface ReceivableClosedPayload {
  receivableId: string;
  organizationId: string;
}

@Injectable()
export class ReceivableClosedListener {
  constructor(
    @Inject(INTERNAL_TASK_REPOSITORY)
    private readonly internalTaskRepo: IInternalTaskRepository,
    private readonly tenantContext: TenantContextService,
    private readonly dataSource: DataSource,
  ) {}

  @OnEvent('receivable.status-closed')
  async handle(payload: ReceivableClosedPayload): Promise<void> {
    await this.tenantContext.run(
      {
        userId: 'system',
        organizationId: payload.organizationId,
        role: Role.OWNER,
      },
      () =>
        this.dataSource.transaction((manager) =>
          this.internalTaskRepo.dismissOpenByReceivableId(
            payload.receivableId,
            manager,
          ),
        ),
    );
  }
}
