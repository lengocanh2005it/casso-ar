import { Inject, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import {
  AuditActionType,
  AuditEntityType,
} from '../../../common/audit/audit.enums';
import { AuditLog } from '../../../common/audit/audit-log';
import {
  AUDIT_LOG_REPOSITORY,
  type IAuditLogRepository,
} from '../../../common/audit/audit-log-repository.port';
import { ChangeSubscriptionPlanUseCase } from '../../billing/application/change-subscription-plan.usecase';
import {
  type IPlanUpgradeOrderRepository,
  PLAN_UPGRADE_ORDER_REPOSITORY,
} from './plan-upgrade-order-repository.port';

export interface ConfirmPlanUpgradeOrderInput {
  orderCode: number;
  paymentSucceeded: boolean;
}

@Injectable()
export class ConfirmPlanUpgradeOrderUseCase {
  constructor(
    @Inject(PLAN_UPGRADE_ORDER_REPOSITORY)
    private readonly orderRepo: IPlanUpgradeOrderRepository,
    private readonly changePlanUseCase: ChangeSubscriptionPlanUseCase,
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly auditLogRepo: IAuditLogRepository,
    private readonly dataSource: DataSource,
  ) {}

  async execute(input: ConfirmPlanUpgradeOrderInput): Promise<void> {
    await this.dataSource.transaction(async (manager: EntityManager) => {
      const order = await this.orderRepo.lockAndFindByOrderCode(
        input.orderCode,
        manager,
      );
      if (!order || order.isTerminal()) return;

      if (!input.paymentSucceeded) {
        await this.orderRepo.save(order.markFailed(), manager);
        return;
      }

      await this.changePlanUseCase.execute(
        order.organizationId,
        order.targetPlanId,
      );
      const paidOrder = order.markPaid();
      await this.orderRepo.save(paidOrder, manager);
      await this.auditLogRepo.create(
        new AuditLog({
          organizationId: order.organizationId,
          userId: 'system',
          actionType: AuditActionType.SUBSCRIPTION_CHANGE_PLAN,
          entityType: AuditEntityType.SUBSCRIPTION,
          entityId: order.organizationId,
          beforeState: null,
          afterState: {
            planId: order.targetPlanId,
            orderCode: order.orderCode,
          },
          ipAddress: null,
          createdAt: new Date(),
        }),
        manager,
      );
    });
  }
}
