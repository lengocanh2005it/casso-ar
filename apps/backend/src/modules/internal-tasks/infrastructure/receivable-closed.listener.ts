import { Inject, Injectable, Logger } from '@nestjs/common';
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
  private readonly logger = new Logger(ReceivableClosedListener.name);

  constructor(
    @Inject(INTERNAL_TASK_REPOSITORY)
    private readonly internalTaskRepo: IInternalTaskRepository,
    private readonly tenantContext: TenantContextService,
    private readonly dataSource: DataSource,
  ) {}

  // 'receivable.status-closed' is emitted fire-and-forget (EventEmitter2#emit,
  // not #emitAsync) with no app-wide unhandledRejection handler, so a throw
  // here (DB failure, ...) would otherwise surface as an unhandled rejection
  // and take down the process — never let a secondary task-dismissal write
  // crash the business flow that produced it. Log and swallow.
  @OnEvent('receivable.status-closed')
  async handle(payload: ReceivableClosedPayload): Promise<void> {
    try {
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
    } catch (error) {
      this.logger.error({
        message: 'Failed to dismiss open internal tasks for closed receivable',
        receivableId: payload.receivableId,
        organizationId: payload.organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
