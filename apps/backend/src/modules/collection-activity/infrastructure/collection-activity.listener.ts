import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { Role } from '../../organizations/domain/membership';
import {
  IReceivableRepository,
  RECEIVABLE_REPOSITORY,
} from '../../receivables/application/receivable-repository.port';
import {
  COLLECTION_ACTIVITY_REPOSITORY,
  ICollectionActivityRepository,
} from '../application/collection-activity-repository.port';
import {
  CollectionActivity,
  CollectionActivityType,
} from '../domain/collection-activity';

export interface PaymentAllocatedEvent {
  paymentId: string;
  receivableId: string;
  customerId: string;
  organizationId: string;
  amount: number;
  allocatedByUserId: string;
}

export interface ReceivableClosedEvent {
  receivableId: string;
  customerId: string;
  organizationId: string;
}

export interface DisputeEvent {
  disputeId: string;
  receivableId: string;
  organizationId: string;
}

export interface ReminderEvent {
  reminderExecutionId: string;
  receivableId: string;
  organizationId: string;
}

@Injectable()
export class CollectionActivityListener {
  private readonly logger = new Logger(CollectionActivityListener.name);

  constructor(
    @Inject(COLLECTION_ACTIVITY_REPOSITORY)
    private readonly activityRepo: ICollectionActivityRepository,
    @Inject(RECEIVABLE_REPOSITORY)
    private readonly receivableRepo: IReceivableRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  @OnEvent('payment.allocated')
  async onPaymentAllocated(payload: PaymentAllocatedEvent): Promise<void> {
    await this.safely('payment.allocated', payload.receivableId, () =>
      this.write({
        organizationId: payload.organizationId,
        receivableId: payload.receivableId,
        customerId: payload.customerId,
        activityType: CollectionActivityType.PAYMENT_RECEIVED,
        description: `Received payment of ${payload.amount.toLocaleString('vi-VN')} VND for receivable`,
        metadata: { paymentId: payload.paymentId, amount: payload.amount },
        createdByUserId: payload.allocatedByUserId,
      }),
    );
  }

  @OnEvent('receivable.closed')
  async onReceivableClosed(payload: ReceivableClosedEvent): Promise<void> {
    await this.safely('receivable.closed', payload.receivableId, () =>
      this.write({
        organizationId: payload.organizationId,
        receivableId: payload.receivableId,
        customerId: payload.customerId,
        activityType: CollectionActivityType.RECEIVABLE_CLOSED,
        description: 'Receivable has been fully paid (PAID)',
        metadata: {},
        createdByUserId: null,
      }),
    );
  }

  @OnEvent('dispute.opened')
  async onDisputeOpened(payload: DisputeEvent): Promise<void> {
    await this.safely('dispute.opened', payload.receivableId, async () => {
      const customerId = await this.resolveCustomerId(
        payload.receivableId,
        payload.organizationId,
      );
      await this.write({
        organizationId: payload.organizationId,
        receivableId: payload.receivableId,
        customerId,
        activityType: CollectionActivityType.DISPUTE_OPENED,
        description: 'Dispute opened for receivable',
        metadata: { disputeId: payload.disputeId },
        createdByUserId: null,
      });
    });
  }

  @OnEvent('dispute.resolved')
  async onDisputeResolved(payload: DisputeEvent): Promise<void> {
    await this.safely('dispute.resolved', payload.receivableId, async () => {
      const customerId = await this.resolveCustomerId(
        payload.receivableId,
        payload.organizationId,
      );
      await this.write({
        organizationId: payload.organizationId,
        receivableId: payload.receivableId,
        customerId,
        activityType: CollectionActivityType.DISPUTE_RESOLVED,
        description: 'Dispute resolved',
        metadata: { disputeId: payload.disputeId },
        createdByUserId: null,
      });
    });
  }

  @OnEvent('reminder.sent')
  async onReminderSent(payload: ReminderEvent): Promise<void> {
    await this.safely('reminder.sent', payload.receivableId, async () => {
      const customerId = await this.resolveCustomerId(
        payload.receivableId,
        payload.organizationId,
      );
      await this.write({
        organizationId: payload.organizationId,
        receivableId: payload.receivableId,
        customerId,
        activityType: CollectionActivityType.EMAIL_SENT,
        description: 'Payment reminder email sent',
        metadata: { reminderExecutionId: payload.reminderExecutionId },
        createdByUserId: null,
      });
    });
  }

  @OnEvent('reminder.failed')
  async onReminderFailed(payload: ReminderEvent): Promise<void> {
    await this.safely('reminder.failed', payload.receivableId, async () => {
      const customerId = await this.resolveCustomerId(
        payload.receivableId,
        payload.organizationId,
      );
      await this.write({
        organizationId: payload.organizationId,
        receivableId: payload.receivableId,
        customerId,
        activityType: CollectionActivityType.EMAIL_FAILED,
        description: 'Payment reminder email failed to send',
        metadata: { reminderExecutionId: payload.reminderExecutionId },
        createdByUserId: null,
      });
    });
  }

  // A denormalized display log must never take down the business flow that
  // produced it. 4 of the 6 events above are emitted fire-and-forget
  // (EventEmitter2#emit, not #emitAsync) with no app-wide unhandledRejection
  // handler, so any throw here (repo failure, receivable lookup miss, ...)
  // would otherwise surface as an unhandled rejection. Log and swallow.
  private async safely(
    eventName: string,
    receivableId: string,
    fn: () => Promise<void>,
  ): Promise<void> {
    try {
      await fn();
    } catch (error) {
      this.logger.error(
        `Failed to record collection activity for event "${eventName}" (receivableId=${receivableId}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async resolveCustomerId(
    receivableId: string,
    organizationId: string,
  ): Promise<string> {
    return this.tenantContext.run(
      { userId: 'system', organizationId, role: Role.OWNER },
      async () => {
        const receivable = await this.receivableRepo.findById(receivableId);
        if (!receivable) {
          throw new AppError(
            ErrorCode.RECEIVABLE_NOT_FOUND,
            'Không tìm thấy khoản phải thu để ghi nhận hoạt động.',
          );
        }
        return receivable.customerId;
      },
    );
  }

  private async write(input: {
    organizationId: string;
    receivableId: string;
    customerId: string;
    activityType: CollectionActivityType;
    description: string;
    metadata: Record<string, unknown>;
    createdByUserId: string | null;
  }): Promise<void> {
    await this.tenantContext.run(
      {
        userId: 'system',
        organizationId: input.organizationId,
        role: Role.OWNER,
      },
      async () => {
        await this.activityRepo.create(
          new CollectionActivity({
            id: randomUUID(),
            organizationId: input.organizationId,
            receivableId: input.receivableId,
            customerId: input.customerId,
            activityType: input.activityType,
            description: input.description,
            metadata: input.metadata,
            createdByUserId: input.createdByUserId,
            createdAt: new Date(),
          }),
        );
      },
    );
  }
}
