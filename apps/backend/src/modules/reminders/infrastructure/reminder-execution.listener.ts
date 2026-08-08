import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { REMINDER_EXECUTION_REPOSITORY } from '../../../common/tokens/reminder-execution.token';
import { Role } from '../../organizations/domain/membership';
import type { IReminderExecutionRepository } from '../application/reminder-execution-repository.port';

@Injectable()
export class ReminderExecutionListener {
  private readonly logger = new Logger(ReminderExecutionListener.name);

  constructor(
    @Inject(REMINDER_EXECUTION_REPOSITORY)
    private readonly executionRepo: IReminderExecutionRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  @OnEvent('reminder.execution.completed')
  async handleExecutionCompleted(payload: {
    id: string;
    status: 'SENT' | 'FAILED';
    providerMessageId: string | null;
    organizationId: string;
  }): Promise<void> {
    await this.tenantContext.run(
      {
        userId: 'system',
        organizationId: payload.organizationId,
        role: Role.OWNER,
      },
      () =>
        this.executionRepo.updateSendResult(
          payload.id,
          payload.status,
          payload.providerMessageId,
        ),
    );
  }
}
