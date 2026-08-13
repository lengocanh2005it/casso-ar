import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { ReminderScanCompletedPayload } from '../../internal-tasks/infrastructure/reminder-scan-completed.listener';
import {
  type IMembershipRepository,
  MEMBERSHIP_REPOSITORY,
} from '../../organizations/application/membership-repository.port';
import { Role } from '../../organizations/domain/membership';
import { CreateAlertUseCase } from '../application/create-alert.usecase';
import { AlertType } from '../domain/alert';

interface ReminderScanCompletedWithCountsPayload
  extends ReminderScanCompletedPayload {
  queuedCount: number;
  skippedCount: number;
}

@Injectable()
export class ReminderScanAlertListener {
  private readonly logger = new Logger(ReminderScanAlertListener.name);

  constructor(
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: IMembershipRepository,
    private readonly createAlert: CreateAlertUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  @OnEvent('reminder.scan.completed')
  async handle(payload: ReminderScanCompletedWithCountsPayload): Promise<void> {
    if (payload.queuedCount <= 0) return;
    try {
      await this.tenantContext.run(
        {
          userId: 'system',
          organizationId: payload.organizationId,
          role: Role.OWNER,
        },
        async () => {
          const membership = await this.membershipRepo.findOwnerByOrganization(
            payload.organizationId,
          );
          if (!membership) return;

          await this.createAlert.execute({
            organizationId: payload.organizationId,
            userId: membership.userId,
            type: AlertType.REMINDER_SCAN_SUMMARY,
            entityType: 'reminder_scan',
            entityId: payload.organizationId,
          });
        },
      );
    } catch (error) {
      this.logger.error({
        message: 'Reminder scan summary alert could not be created',
        organizationId: payload.organizationId,
        userId: 'system',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
