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
import {
  type IPeriodChargeRepository,
  PERIOD_CHARGE_REPOSITORY,
} from './period-charge-repository.port';

export interface ConfirmPeriodChargeInput {
  orderCode: number;
  paymentSucceeded: boolean;
}

@Injectable()
export class ConfirmPeriodChargeUseCase {
  constructor(
    @Inject(PERIOD_CHARGE_REPOSITORY)
    private readonly chargeRepo: IPeriodChargeRepository,
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly auditLogRepo: IAuditLogRepository,
    private readonly dataSource: DataSource,
  ) {}

  async execute(input: ConfirmPeriodChargeInput): Promise<void> {
    await this.dataSource.transaction(async (manager: EntityManager) => {
      const charge = await this.chargeRepo.lockAndFindByOrderCode(
        input.orderCode,
        manager,
      );
      if (!charge || charge.isTerminal()) return;

      if (!input.paymentSucceeded) {
        await this.chargeRepo.save(
          charge.markFailed(),
          manager,
          charge.organizationId,
        );
        return;
      }

      const paidCharge = charge.markPaid();
      await this.chargeRepo.save(paidCharge, manager, charge.organizationId);
      await this.auditLogRepo.create(
        new AuditLog({
          organizationId: charge.organizationId,
          userId: 'system',
          actionType: AuditActionType.PERIOD_CHARGE_PAID,
          entityType: AuditEntityType.PERIOD_CHARGE,
          entityId: charge.organizationId,
          beforeState: null,
          afterState: {
            planId: charge.planId,
            orderCode: charge.orderCode,
            periodStart: charge.periodStart.toISOString(),
            periodEnd: charge.periodEnd.toISOString(),
          },
          ipAddress: null,
          createdAt: new Date(),
        }),
        manager,
      );
    });
  }
}
