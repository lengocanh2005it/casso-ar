import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { REMINDER_EXECUTION_REPOSITORY } from '../../../common/tokens/reminder-execution.token';
import {
  type IOrganizationRepository,
  ORGANIZATION_REPOSITORY,
} from '../../organizations/application/organization-repository.port';
import { Role } from '../../organizations/domain/membership';
import type { IReminderExecutionRepository } from './reminder-execution-repository.port';
import { ReminderSenderService } from './reminder-sender.service';

const RECOVERY_INTERVAL_MS = 60_000;
const RECOVERY_BATCH_SIZE = 100;

@Injectable()
export class ReminderExecutionRecoveryService {
  private readonly logger = new Logger(ReminderExecutionRecoveryService.name);

  constructor(
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepo: IOrganizationRepository,
    @Inject(REMINDER_EXECUTION_REPOSITORY)
    private readonly executionRepo: IReminderExecutionRepository,
    private readonly reminderSender: ReminderSenderService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Cron('*/1 * * * *')
  async recoverStalePending(now: Date = new Date()): Promise<void> {
    const cutoff = new Date(now.getTime() - RECOVERY_INTERVAL_MS);
    const organizationIds = await this.organizationRepo.findAllIds();

    for (const organizationId of organizationIds) {
      try {
        await this.tenantContext.run(
          { userId: 'system', organizationId, role: Role.OWNER },
          async () => {
            const executions =
              await this.executionRepo.findPendingAutomatedBefore(
                cutoff,
                RECOVERY_BATCH_SIZE,
              );

            for (const execution of executions.slice(0, RECOVERY_BATCH_SIZE)) {
              if (!execution.reminderRuleId) continue;
              try {
                await this.reminderSender.send({
                  organizationId,
                  receivableId: execution.receivableId,
                  reminderRuleId: execution.reminderRuleId,
                  executionDate: execution.executionDate
                    .toISOString()
                    .slice(0, 10),
                });
              } catch (error) {
                this.logger.error({
                  message: 'Failed to recover reminder execution',
                  organizationId,
                  executionId: execution.id,
                  error: error instanceof Error ? error.message : String(error),
                });
              }
            }
          },
        );
      } catch (error) {
        this.logger.error({
          message: 'Failed to scan stale reminder executions',
          organizationId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}
