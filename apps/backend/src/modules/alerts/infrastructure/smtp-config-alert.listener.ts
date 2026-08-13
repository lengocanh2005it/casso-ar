import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import {
  SMTP_CONFIG_FAILED,
  type SmtpConfigFailedEvent,
} from '../../notifications/application/smtp-config-failed.event';
import {
  type IMembershipRepository,
  MEMBERSHIP_REPOSITORY,
} from '../../organizations/application/membership-repository.port';
import { Role } from '../../organizations/domain/membership';
import { CreateAlertUseCase } from '../application/create-alert.usecase';
import { AlertType } from '../domain/alert';

@Injectable()
export class SmtpConfigAlertListener {
  private readonly logger = new Logger(SmtpConfigAlertListener.name);

  constructor(
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: IMembershipRepository,
    private readonly createAlert: CreateAlertUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  @OnEvent(SMTP_CONFIG_FAILED)
  async handle(payload: SmtpConfigFailedEvent): Promise<void> {
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
            type: AlertType.SMTP_FAILED,
            entityType: 'smtp_config',
            entityId: payload.smtpConfigId,
          });
        },
      );
    } catch (error) {
      this.logger.error({
        message: 'SMTP config alert could not be created',
        organizationId: payload.organizationId,
        smtpConfigId: payload.smtpConfigId,
        userId: 'system',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
