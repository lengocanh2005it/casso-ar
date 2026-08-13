import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import {
  BANK_CONNECTION_STATUS_CHANGED,
  type BankConnectionStatusChangedEvent,
} from '../../bank-connections/application/mark-requires-reauthorization.usecase';
import {
  type IMembershipRepository,
  MEMBERSHIP_REPOSITORY,
} from '../../organizations/application/membership-repository.port';
import { Role } from '../../organizations/domain/membership';
import { CreateAlertUseCase } from '../application/create-alert.usecase';
import { AlertType } from '../domain/alert';

@Injectable()
export class BankConnectionAlertListener {
  private readonly logger = new Logger(BankConnectionAlertListener.name);

  constructor(
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: IMembershipRepository,
    private readonly createAlert: CreateAlertUseCase,
    private readonly tenantContext: TenantContextService,
  ) {}

  @OnEvent(BANK_CONNECTION_STATUS_CHANGED)
  async handle(payload: BankConnectionStatusChangedEvent): Promise<void> {
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
            type:
              payload.status === 'ERROR'
                ? AlertType.BANK_CONNECTION_ERROR
                : AlertType.BANK_CONNECTION_NEEDS_REAUTH,
            entityType: 'bank_connection',
            entityId: payload.bankConnectionId,
          });
        },
      );
    } catch (error) {
      this.logger.error({
        message: 'Bank connection alert could not be created',
        bankConnectionId: payload.bankConnectionId,
        organizationId: payload.organizationId,
        status: payload.status,
        userId: 'system',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
